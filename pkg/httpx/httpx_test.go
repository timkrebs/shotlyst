package httpx

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/timkrebs/shotlyst/pkg/dbx"
	"github.com/timkrebs/shotlyst/pkg/dbx/dbtest"
	"github.com/timkrebs/shotlyst/pkg/metrics"
)

func TestMain(m *testing.M) { dbtest.Main(m) }

func newTestRouter(t *testing.T, logs *bytes.Buffer, checks ...Check) http.Handler {
	t.Helper()
	r := NewRouter(RouterOptions{
		Logger:  slog.New(slog.NewJSONHandler(logs, &slog.HandlerOptions{Level: slog.LevelDebug})),
		Metrics: metrics.New("test"),
		Ready:   checks,
	})
	r.Route("/api/v1/test", func(r chi.Router) {
		r.Get("/items/{id}", func(w http.ResponseWriter, r *http.Request) {
			id, err := PathUUID(r, "id")
			if err != nil {
				ProblemBadRequest(w, r, "invalid id")
				return
			}
			Encode(w, http.StatusOK, map[string]string{"id": id.String()})
		})
		r.Post("/items", func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				Name string `json:"name"`
			}
			if err := DecodeJSON(r, &body); err != nil {
				ProblemFromDecode(w, r, err)
				return
			}
			if body.Name == "" {
				ProblemUnprocessable(w, r, "name", "required")
				return
			}
			Encode(w, http.StatusCreated, body)
		})
		r.Get("/store/{kind}", func(w http.ResponseWriter, r *http.Request) {
			errs := map[string]error{"missing": dbx.ErrNotFound, "dup": fmt.Errorf("x: %w", dbx.ErrConflict), "boom": errors.New("boom")}
			ProblemFromStore(w, r, errs[chi.URLParam(r, "kind")])
		})
	})
	return r
}

func do(h http.Handler, method, path, body string, hdr ...string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	for i := 0; i+1 < len(hdr); i += 2 {
		req.Header.Set(hdr[i], hdr[i+1])
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func problemOf(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	if ct := rec.Header().Get("Content-Type"); ct != "application/problem+json" {
		t.Fatalf("content-type %q, body %s", ct, rec.Body)
	}
	var p map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestCSRFHeaderRequiredForWrites(t *testing.T) {
	h := newTestRouter(t, &bytes.Buffer{})
	rec := do(h, http.MethodPost, "/api/v1/test/items", `{"name":"a"}`)
	if rec.Code != http.StatusForbidden || problemOf(t, rec)["type"] != "/problems/csrf" {
		t.Fatalf("without header: %d %s", rec.Code, rec.Body)
	}
	rec = do(h, http.MethodPost, "/api/v1/test/items", `{"name":"a"}`, HeaderClient, "web")
	if rec.Code != http.StatusCreated {
		t.Fatalf("with header: %d %s", rec.Code, rec.Body)
	}
}

func TestDecodeAndValidationProblems(t *testing.T) {
	h := newTestRouter(t, &bytes.Buffer{})
	cases := []struct {
		body   string
		status int
	}{
		{``, 400},
		{`{"name":`, 400},
		{`{"name":"a","extra":1}`, 400},
		{`{"name":"a"}{"name":"b"}`, 400},
		{`{"name":"` + strings.Repeat("x", MaxBodyBytes) + `"}`, 413},
		{`{"name":""}`, 422},
	}
	for _, c := range cases {
		rec := do(h, http.MethodPost, "/api/v1/test/items", c.body, HeaderClient, "web")
		if rec.Code != c.status {
			t.Errorf("body %.30q: status %d, want %d", c.body, rec.Code, c.status)
			continue
		}
		p := problemOf(t, rec)
		if c.status == 422 {
			errs := p["errors"].([]any)
			if errs[0].(map[string]any)["field"] != "name" {
				t.Errorf("field error missing: %v", p)
			}
		}
	}
}

func TestPathUUIDAndNotFound(t *testing.T) {
	h := newTestRouter(t, &bytes.Buffer{})
	if rec := do(h, http.MethodGet, "/api/v1/test/items/not-a-uuid", ""); rec.Code != 400 {
		t.Errorf("bad uuid: %d", rec.Code)
	}
	if rec := do(h, http.MethodGet, "/api/v1/test/items/6f2c1d2e-1111-4a4a-8b8b-0123456789ab", ""); rec.Code != 200 {
		t.Errorf("good uuid: %d", rec.Code)
	}
	rec := do(h, http.MethodGet, "/nowhere", "")
	if rec.Code != 404 || problemOf(t, rec)["type"] != "/problems/not-found" {
		t.Errorf("unknown route: %d %s", rec.Code, rec.Body)
	}
}

func TestProblemFromStoreMapping(t *testing.T) {
	var logs bytes.Buffer
	h := newTestRouter(t, &logs)
	for kind, want := range map[string]int{"missing": 404, "dup": 409, "boom": 500} {
		if rec := do(h, http.MethodGet, "/api/v1/test/store/"+kind, ""); rec.Code != want {
			t.Errorf("%s: %d, want %d", kind, rec.Code, want)
		}
	}
	if !strings.Contains(logs.String(), `"error":"boom"`) {
		t.Errorf("500 cause not logged: %s", logs.String())
	}
	if strings.Contains(do(h, http.MethodGet, "/api/v1/test/store/boom", "").Body.String(), "boom") {
		t.Error("internal error leaked to client")
	}
}

func TestHealthAndMetrics(t *testing.T) {
	h := newTestRouter(t, &bytes.Buffer{})
	if rec := do(h, http.MethodGet, "/healthz", ""); rec.Code != 200 {
		t.Errorf("healthz %d", rec.Code)
	}
	do(h, http.MethodGet, "/api/v1/test/items/6f2c1d2e-1111-4a4a-8b8b-0123456789ab", "")
	rec := do(h, http.MethodGet, "/metrics", "")
	if !strings.Contains(rec.Body.String(), `route="/api/v1/test/items/{id}"`) {
		t.Errorf("metrics missing route label:\n%s", rec.Body)
	}
}

// TestReadyzWithPostgres is the integration test required by CLAUDE.md:
// /readyz reflects a real database, and the transition is logged once.
func TestReadyzWithPostgres(t *testing.T) {
	pool := dbtest.Pool(t, "readyz", nil)
	var logs bytes.Buffer
	h := newTestRouter(t, &logs, Check{Name: "postgres", Fn: func(ctx context.Context) error { return dbx.Ping(ctx, pool) }})

	if rec := do(h, http.MethodGet, "/readyz", ""); rec.Code != 200 {
		t.Fatalf("ready with db up: %d %s", rec.Code, rec.Body)
	}
	pool.Close()
	for range 2 {
		if rec := do(h, http.MethodGet, "/readyz", ""); rec.Code != 503 {
			t.Fatalf("ready with db closed: %d", rec.Code)
		}
	}
	if n := strings.Count(logs.String(), `"msg":"dependency unavailable"`); n != 1 {
		t.Errorf("want exactly one transition line, got %d:\n%s", n, logs.String())
	}
}

func TestRateLimiter(t *testing.T) {
	now := time.Unix(0, 0)
	rl := NewRateLimiter(6, 2, func() time.Time { return now }) // one token per 10 s
	h := rl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	call := func(ip string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/login", nil)
		req.RemoteAddr = ip + ":1234"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	for i := range 2 {
		if call("1.1.1.1").Code != 200 {
			t.Fatalf("burst call %d rejected", i)
		}
	}
	rec := call("1.1.1.1")
	if rec.Code != 429 || rec.Header().Get("Retry-After") != "10" {
		t.Fatalf("third call: %d retry-after %q", rec.Code, rec.Header().Get("Retry-After"))
	}
	if call("2.2.2.2").Code != 200 {
		t.Fatal("other IPs have their own bucket")
	}
	now = now.Add(10 * time.Second)
	if call("1.1.1.1").Code != 200 {
		t.Fatal("token should refill")
	}
}
