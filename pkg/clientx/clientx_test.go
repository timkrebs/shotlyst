package clientx

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/timkrebs/shotlyst/pkg/authx"
	"github.com/timkrebs/shotlyst/pkg/httpx"
	"github.com/timkrebs/shotlyst/pkg/logx"
	"github.com/timkrebs/shotlyst/pkg/metrics"
)

// requestCtx simulates being inside an authenticated request so the
// propagation headers have something to forward.
func requestCtx(t *testing.T, logs *bytes.Buffer) context.Context {
	t.Helper()
	var ctx context.Context
	base := slog.New(slog.NewJSONHandler(logs, nil))
	h := logx.Middleware(base)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { ctx = r.Context() }))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set(logx.HeaderRequestID, "req-1")
	h.ServeHTTP(httptest.NewRecorder(), req)
	return authx.WithSession(ctx, authx.Claims{UserID: uuid.New(), SessionID: uuid.New()}, "tok-1")
}

func TestPropagatesHeadersAndDecodes(t *testing.T) {
	var got http.Header
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Clone()
		_ = json.NewEncoder(w).Encode(map[string]int{"n": 7})
	}))
	defer srv.Close()

	var logs bytes.Buffer
	reg := metrics.New("planning")
	c := New("gear", srv.URL, Options{Metrics: reg})
	var out struct{ N int }
	if err := c.Do(requestCtx(t, &logs), http.MethodPost, "/api/v1/gear/resolve", map[string]any{"ids": []string{}}, &out); err != nil {
		t.Fatal(err)
	}
	if out.N != 7 {
		t.Errorf("decoded %+v", out)
	}
	for k, v := range map[string]string{"X-Request-Id": "req-1", "Authorization": "Bearer tok-1",
		httpx.HeaderClient: "web", "Content-Type": "application/json"} {
		if got.Get(k) != v {
			t.Errorf("header %s = %q, want %q", k, got.Get(k), v)
		}
	}
	if !strings.Contains(logs.String(), `"msg":"outbound call"`) || !strings.Contains(logs.String(), `"target_service":"gear"`) ||
		!strings.Contains(logs.String(), `"request_id":"req-1"`) {
		t.Errorf("outbound line missing: %s", logs.String())
	}
}

func TestRetriesIdempotentThenGivesUp(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	var logs bytes.Buffer
	c := New("gear", srv.URL, Options{Backoff: time.Millisecond})
	err := c.Do(requestCtx(t, &logs), http.MethodGet, "/x", nil, nil)
	if !errors.Is(err, ErrUnavailable) || calls.Load() != 3 {
		t.Fatalf("err=%v calls=%d", err, calls.Load())
	}
	if strings.Count(logs.String(), `"msg":"outbound call"`) != 2 ||
		!strings.Contains(logs.String(), `"msg":"dependency unavailable"`) ||
		!strings.Contains(logs.String(), `"dependency":"gear"`) {
		t.Errorf("unexpected log lines:\n%s", logs.String())
	}

	calls.Store(0)
	_ = c.Do(requestCtx(t, &logs), http.MethodPost, "/x", map[string]int{}, nil)
	if calls.Load() != 1 {
		t.Errorf("POST retried: %d calls", calls.Load())
	}
}

func TestDownDependencyIsUnavailable(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL
	srv.Close() // connection refused from now on

	c := New("sun", url, Options{Backoff: time.Millisecond})
	if err := c.Do(context.Background(), http.MethodGet, "/x", nil, nil); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("err = %v", err)
	}
}

func TestClientErrorsAreNotUnavailable(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	err := New("gear", srv.URL, Options{}).Do(context.Background(), http.MethodGet, "/x", nil, nil)
	var se *StatusError
	if !errors.As(err, &se) || se.Status != 404 || errors.Is(err, ErrUnavailable) || calls.Load() != 1 {
		t.Fatalf("err=%v calls=%d", err, calls.Load())
	}
}

func TestCache(t *testing.T) {
	now := time.Unix(0, 0)
	c := NewCache[string, int](time.Minute, 2, func() time.Time { return now })
	c.Set("a", 1)
	now = now.Add(time.Second)
	c.Set("b", 2)
	if v, ok := c.Get("a"); !ok || v != 1 {
		t.Fatalf("get a = %v %v", v, ok)
	}
	now = now.Add(time.Second)
	c.Set("c", 3) // full: evicts oldest ("a")
	if _, ok := c.Get("a"); ok {
		t.Error("oldest entry not evicted")
	}
	now = time.Unix(61, 0) // b (set at 1 s) expires now; c (set at 2 s) does not
	if _, ok := c.Get("c"); !ok {
		t.Error("c should still be fresh")
	}
	if _, ok := c.Get("b"); ok {
		t.Error("b should have expired")
	}
}
