package logx

import (
	"bytes"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

// lines decodes every JSON line written to buf.
func lines(t *testing.T, buf *bytes.Buffer) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, l := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if l == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(l), &m); err != nil {
			t.Fatalf("not JSON: %q: %v", l, err)
		}
		out = append(out, m)
	}
	return out
}

func testLogger(t *testing.T, buf *bytes.Buffer, level string) *slog.Logger {
	t.Helper()
	l, err := New(Options{Service: "sun", Version: "1.2.3", Pod: "sun-abc", Namespace: "shotlyst",
		Node: "k8s-cp-01", Level: level, Format: "json", Out: buf})
	if err != nil {
		t.Fatal(err)
	}
	return l
}

func TestBaseFieldsOnEveryLine(t *testing.T) {
	var buf bytes.Buffer
	testLogger(t, &buf, "info").Info("starting")
	got := lines(t, &buf)[0]
	for k, v := range map[string]string{"service": "sun", "version": "1.2.3", "pod": "sun-abc",
		"namespace": "shotlyst", "node": "k8s-cp-01", "msg": "starting", "level": "INFO"} {
		if got[k] != v {
			t.Errorf("%s = %v, want %v", k, got[k], v)
		}
	}
	if !strings.HasSuffix(got["time"].(string), "Z") {
		t.Errorf("time not UTC: %v", got["time"])
	}
}

func TestNewRejectsBadOptions(t *testing.T) {
	if _, err := New(Options{Level: "loud", Out: &bytes.Buffer{}}); err == nil {
		t.Error("expected level error")
	}
	if _, err := New(Options{Format: "xml", Out: &bytes.Buffer{}}); err == nil {
		t.Error("expected format error")
	}
}

func serve(t *testing.T, buf *bytes.Buffer, h http.HandlerFunc, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	r.Use(Middleware(testLogger(t, buf, "debug")))
	r.Get("/items/{id}", h)
	r.Get("/healthz", h)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestRequestLineFields(t *testing.T) {
	var buf bytes.Buffer
	req := httptest.NewRequest(http.MethodGet, "/items/42", nil)
	req.Header.Set(HeaderRequestID, "abc-123")
	rec := serve(t, &buf, func(w http.ResponseWriter, r *http.Request) {
		ctx := SetUser(r.Context(), "user-1")
		From(ctx).Info("inner")
		_, _ = w.Write([]byte("hello"))
	}, req)

	if rec.Header().Get(HeaderRequestID) != "abc-123" {
		t.Fatalf("request id not echoed")
	}
	ls := lines(t, &buf)
	inner, done := ls[0], ls[1]
	if inner["request_id"] != "abc-123" || inner["user_id"] != "user-1" || inner["pod"] != "sun-abc" {
		t.Errorf("inner line missing fields: %v", inner)
	}
	want := map[string]any{"msg": "request completed", "level": "INFO", "method": "GET",
		"path": "/items/{id}", "status": float64(200), "bytes_out": float64(5),
		"request_id": "abc-123", "user_id": "user-1", "remote_ip": "192.0.2.1"}
	for k, v := range want {
		if done[k] != v {
			t.Errorf("%s = %v, want %v", k, done[k], v)
		}
	}
	if _, ok := done["duration_ms"]; !ok {
		t.Error("duration_ms missing")
	}
}

func TestRequestIDGeneratedWhenMissingOrUnsafe(t *testing.T) {
	var buf bytes.Buffer
	req := httptest.NewRequest(http.MethodGet, "/items/1", nil)
	req.Header.Set(HeaderRequestID, "bad id\nwith newline")
	rec := serve(t, &buf, func(http.ResponseWriter, *http.Request) {}, req)
	id := rec.Header().Get(HeaderRequestID)
	if len(id) != 24 || strings.Contains(id, " ") {
		t.Fatalf("expected generated id, got %q", id)
	}
}

func TestWarnOn4xxWithProblemType(t *testing.T) {
	var buf bytes.Buffer
	serve(t, &buf, func(w http.ResponseWriter, r *http.Request) {
		SetProblem(r.Context(), "not-found")
		w.WriteHeader(http.StatusNotFound)
	}, httptest.NewRequest(http.MethodGet, "/items/1", nil))
	got := lines(t, &buf)[0]
	if got["level"] != "WARN" || got["problem_type"] != "not-found" {
		t.Errorf("unexpected 4xx line: %v", got)
	}
}

func TestErrorOn5xxWithErrorAndStack(t *testing.T) {
	var buf bytes.Buffer
	serve(t, &buf, func(w http.ResponseWriter, r *http.Request) {
		SetError(r.Context(), errors.New("list items: boom"))
		w.WriteHeader(http.StatusInternalServerError)
	}, httptest.NewRequest(http.MethodGet, "/items/1", nil))
	got := lines(t, &buf)[0]
	if got["level"] != "ERROR" || got["error"] != "list items: boom" || !strings.Contains(got["stack"].(string), "goroutine") {
		t.Errorf("unexpected 5xx line: %v", got)
	}
}

func TestPanicRecovered(t *testing.T) {
	var buf bytes.Buffer
	rec := serve(t, &buf, func(http.ResponseWriter, *http.Request) {
		panic("index out of range")
	}, httptest.NewRequest(http.MethodGet, "/items/1", nil))
	if rec.Code != 500 || rec.Header().Get("Content-Type") != "application/problem+json" {
		t.Fatalf("got %d %q", rec.Code, rec.Header().Get("Content-Type"))
	}
	ls := lines(t, &buf)
	if ls[0]["msg"] != "panic recovered" || ls[0]["level"] != "ERROR" || ls[0]["request_id"] == "" {
		t.Errorf("panic line: %v", ls[0])
	}
	if ls[1]["msg"] != "request completed" || ls[1]["status"] != float64(500) {
		t.Errorf("request line: %v", ls[1])
	}
}

func TestHealthLinesAreDebug(t *testing.T) {
	var buf bytes.Buffer
	serve(t, &buf, func(http.ResponseWriter, *http.Request) {}, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if got := lines(t, &buf)[0]; got["level"] != "DEBUG" {
		t.Errorf("health line level = %v", got["level"])
	}
}

func TestRedact(t *testing.T) {
	for in, want := range map[string]string{"tim@gmail.com": "t***@gmail.com", "nope": "***", "@x.de": "***"} {
		if got := Redact(in); got != want {
			t.Errorf("Redact(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestFromFallsBackToDefault(t *testing.T) {
	if From(t.Context()) != slog.Default() {
		t.Error("expected slog.Default outside a request")
	}
}
