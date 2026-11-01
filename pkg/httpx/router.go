// Package httpx is the HTTP layer shared by every service: the router with
// the standard middleware stack, RFC 7807 problem responses, JSON
// decode/encode, path parameter parsing, the CSRF header check, rate
// limiting and the /healthz, /readyz and /metrics endpoints.
//
// It exists so a handler is only "decode → validate → store/domain →
// encode" and every service answers errors, health checks and metrics
// identically. Business rules and SQL must never live here.
package httpx

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/timkrebs/shotlyst/pkg/logx"
	"github.com/timkrebs/shotlyst/pkg/metrics"
)

// HeaderClient is the CSRF guard header (docs/02 §4). Browsers cannot send
// custom headers cross-site without a CORS preflight we never grant, so its
// presence proves the request came from our own origin or another service.
const HeaderClient = "X-Shotlyst-Client"

// RouterOptions configures NewRouter.
type RouterOptions struct {
	Logger  *slog.Logger
	Metrics *metrics.Registry
	Ready   []Check       // evaluated by /readyz
	Timeout time.Duration // per-request deadline; 0 means 30s
	// TrustedProxies is the number of reverse-proxy hops (ingress, Caddy)
	// in front of the service. The client IP is taken that many entries from
	// the right of X-Forwarded-For, so a client cannot spoof it to dodge the
	// login rate limit. 0 trusts only the TCP peer.
	TrustedProxies int
}

// Check is one readiness dependency (Postgres, another service).
type Check struct {
	Name string
	Fn   func(context.Context) error
}

// NewRouter returns a chi router with the standard stack applied in this
// order: client IP, metrics, logging + panic recovery, CSRF header check,
// request timeout. Metrics sits outside logx so a recovered panic is
// still counted as a 500. Health and metrics endpoints are mounted at the
// root; the caller mounts its API under its ingress prefix.
func NewRouter(o RouterOptions) chi.Router {
	if o.Timeout == 0 {
		o.Timeout = 30 * time.Second
	}
	clientIP := middleware.ClientIPFromRemoteAddr
	if o.TrustedProxies > 0 {
		clientIP = middleware.ClientIPFromXFFTrustedProxies(o.TrustedProxies)
	}
	r := chi.NewRouter()
	r.Use(clientIP, o.Metrics.Middleware, logx.Middleware(o.Logger), CSRF, middleware.Timeout(o.Timeout))
	r.NotFound(func(w http.ResponseWriter, r *http.Request) { ProblemNotFound(w, r) })
	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		WriteProblem(w, r, Problem{Status: http.StatusMethodNotAllowed, Type: "method-not-allowed"})
	})
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		Encode(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Get("/readyz", newReadiness(o.Ready).ServeHTTP)
	r.Handle("/metrics", o.Metrics.Handler())
	return r
}

// CSRF rejects state-changing requests that lack HeaderClient: web.
// Safe methods pass so links, probes and Prometheus need no header.
func CSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
		default:
			if r.Header.Get(HeaderClient) != "web" {
				WriteProblem(w, r, Problem{Status: http.StatusForbidden, Type: "csrf",
					Detail: "missing " + HeaderClient + " header"})
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// readiness serves /readyz. It logs only on state changes ("dependency
// unavailable" / "dependency recovered") because the kubelet probes every
// five seconds and one line per probe would flood Loki during an outage.
type readiness struct {
	checks []Check
	mu     sync.Mutex
	failed map[string]bool
}

func newReadiness(checks []Check) *readiness {
	return &readiness{checks: checks, failed: map[string]bool{}}
}

func (rd *readiness) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	status := map[string]string{}
	ok := true
	for _, c := range rd.checks {
		err := c.Fn(ctx)
		rd.transition(ctx, c.Name, err)
		if err != nil {
			ok = false
			status[c.Name] = "unavailable"
		} else {
			status[c.Name] = "ok"
		}
	}
	code := http.StatusOK
	if !ok {
		code = http.StatusServiceUnavailable
	}
	Encode(w, code, map[string]any{"ready": ok, "checks": status})
}

func (rd *readiness) transition(ctx context.Context, name string, err error) {
	rd.mu.Lock()
	defer rd.mu.Unlock()
	was := rd.failed[name]
	switch {
	case err != nil && !was:
		logx.From(ctx).Warn("dependency unavailable", "dependency", name, "error", err.Error())
	case err == nil && was:
		logx.From(ctx).Info("dependency recovered", "dependency", name)
	}
	rd.failed[name] = err != nil
}
