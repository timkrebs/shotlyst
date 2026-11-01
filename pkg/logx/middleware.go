package logx

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// HeaderRequestID carries the correlation id between the browser, the
// ingress and every service hop.
const HeaderRequestID = "X-Request-Id"

// quietPaths are hit by kubelet and Prometheus every few seconds; logging
// them at INFO would drown real traffic in Loki, so they log at DEBUG.
var quietPaths = map[string]bool{"/healthz": true, "/readyz": true, "/metrics": true}

// requestState collects facts discovered while handling a request (who the
// user is, which problem was returned, which error caused a 5xx) so the
// single "request completed" line can include them. Handlers and other
// packages write it through SetUser, SetProblem and SetError.
type requestState struct {
	mu          sync.Mutex
	requestID   string
	userID      string
	problemType string
	err         error
	stack       []byte
}

func state(ctx context.Context) *requestState {
	st, _ := ctx.Value(stateKey).(*requestState)
	return st
}

// RequestID returns the current request's correlation id, or "" outside a
// request. clientx forwards it on outbound calls.
func RequestID(ctx context.Context) string {
	if st := state(ctx); st != nil {
		return st.requestID
	}
	return ""
}

// SetUser records the authenticated user for the request line and returns a
// context whose logger carries user_id on every later line.
func SetUser(ctx context.Context, userID string) context.Context {
	if st := state(ctx); st != nil {
		st.mu.Lock()
		st.userID = userID
		st.mu.Unlock()
	}
	return With(ctx, From(ctx).With("user_id", userID))
}

// SetProblem records the problem+json type of a 4xx response.
func SetProblem(ctx context.Context, problemType string) {
	if st := state(ctx); st != nil {
		st.mu.Lock()
		st.problemType = problemType
		st.mu.Unlock()
	}
}

// SetError records the cause of a 5xx response together with the stack at
// the call site, so the request line answers "what failed, where".
func SetError(ctx context.Context, err error) {
	if st := state(ctx); st != nil {
		st.mu.Lock()
		st.err = err
		st.stack = debug.Stack()
		st.mu.Unlock()
	}
}

// Middleware assigns a request id, stores a request-scoped logger in the
// context, recovers panics and writes exactly one "request completed" line
// per request: INFO for success, WARN for 4xx (with problem_type), ERROR for
// 5xx (with error and stack). It must be the outermost middleware after
// RealIP so every other layer can log through From(ctx).
func Middleware(base *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			st := &requestState{requestID: incomingRequestID(r)}
			l := base.With("request_id", st.requestID)
			ctx := With(context.WithValue(r.Context(), stateKey, st), l)
			w.Header().Set(HeaderRequestID, st.requestID)
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

			defer func() {
				if rec := recover(); rec != nil {
					if rec == http.ErrAbortHandler {
						panic(rec) // net/http's own signal to abort; let it through
					}
					recoverPanic(ctx, ww, rec)
				}
				logRequest(ctx, r, ww, st, start)
			}()
			next.ServeHTTP(ww, r.WithContext(ctx))
		})
	}
}

// recoverPanic turns a handler panic into a logged 500 instead of a dropped
// connection. The response body is a minimal problem+json document written
// here (not via httpx) because httpx depends on this package.
func recoverPanic(ctx context.Context, w middleware.WrapResponseWriter, rec any) {
	err := fmt.Errorf("panic: %v", rec)
	SetError(ctx, err)
	st := state(ctx)
	From(ctx).Error("panic recovered", "error", err.Error(), "stack", string(st.stack))
	if w.Status() == 0 {
		w.Header().Set("Content-Type", "application/problem+json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"type":"/problems/internal","title":"Internal Server Error","status":500}`))
	}
}

func logRequest(ctx context.Context, r *http.Request, w middleware.WrapResponseWriter, st *requestState, start time.Time) {
	status := w.Status()
	if status == 0 {
		status = http.StatusOK
	}
	path := "unmatched"
	if rc := chi.RouteContext(r.Context()); rc != nil && rc.RoutePattern() != "" {
		path = rc.RoutePattern()
	}
	st.mu.Lock()
	defer st.mu.Unlock()
	attrs := []any{
		"method", r.Method,
		"path", path,
		"status", status,
		"duration_ms", time.Since(start).Milliseconds(),
		"bytes_out", w.BytesWritten(),
		"remote_ip", ClientIP(r),
		"user_agent", truncate(r.UserAgent(), 120),
	}
	// ctx is the middleware's own context: its logger has request_id but not
	// user_id (SetUser enriches a deeper context), so add it explicitly.
	if st.userID != "" {
		attrs = append(attrs, "user_id", st.userID)
	}
	l := From(ctx)
	switch {
	case status >= 500:
		if st.err != nil {
			attrs = append(attrs, "error", st.err.Error(), "stack", string(st.stack))
		}
		l.Error("request completed", attrs...)
	case status >= 400:
		attrs = append(attrs, "problem_type", st.problemType)
		l.Warn("request completed", attrs...)
	case quietPaths[r.URL.Path]:
		l.Debug("request completed", attrs...)
	default:
		l.Info("request completed", attrs...)
	}
}

// incomingRequestID keeps a caller-supplied id (another service or the
// SPA) when it looks sane, otherwise generates one. Ids are length- and
// charset-limited because they are echoed into logs and headers.
func incomingRequestID(r *http.Request) string {
	if id := r.Header.Get(HeaderRequestID); id != "" && len(id) <= 64 && safeID(id) {
		return id
	}
	var b [12]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

func safeID(s string) bool {
	for _, c := range s {
		ok := c == '-' || c == '_' || c == '.' ||
			(c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
		if !ok {
			return false
		}
	}
	return true
}

// ClientIP returns the caller's address as established by httpx's
// trusted-proxy middleware, falling back to the TCP peer for direct
// in-cluster calls (no X-Forwarded-For). Logging and rate limiting both use
// it so they always agree on who the client is.
func ClientIP(r *http.Request) string {
	if ip := middleware.GetClientIP(r.Context()); ip != "" {
		return ip
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
