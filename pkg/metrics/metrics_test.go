package metrics

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
)

func scrape(t *testing.T, r *Registry) string {
	t.Helper()
	rec := httptest.NewRecorder()
	r.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	b, _ := io.ReadAll(rec.Body)
	return string(b)
}

func TestHTTPMetricsUseRoutePattern(t *testing.T) {
	reg := New("sun")
	router := chi.NewRouter()
	router.Use(reg.Middleware)
	router.Get("/items/{id}", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) })
	for _, p := range []string{"/items/1", "/items/2", "/nope"} {
		router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, p, nil))
	}

	out := scrape(t, reg)
	for _, want := range []string{
		`http_requests_total{method="GET",route="/items/{id}",service="sun",status="418"} 2`,
		`http_requests_total{method="GET",route="unmatched",service="sun",status="404"} 1`,
		`http_request_duration_seconds_count{route="/items/{id}",service="sun"} 2`,
		`go_goroutines`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q", want)
		}
	}
}

func TestOutboundAndCustomCollectors(t *testing.T) {
	reg := New("planning")
	reg.ObserveOutbound("gear", 200)
	reg.ObserveOutbound("gear", 0)
	c := prometheus.NewCounter(prometheus.CounterOpts{Name: "sync_mutations_total", Help: "x"})
	if err := reg.Register(c); err != nil {
		t.Fatal(err)
	}
	c.Inc()

	out := scrape(t, reg)
	for _, want := range []string{
		`outbound_requests_total{service="planning",status="200",target="gear"} 1`,
		`outbound_requests_total{service="planning",status="error",target="gear"} 1`,
		`sync_mutations_total{service="planning"} 1`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q", want)
		}
	}
}
