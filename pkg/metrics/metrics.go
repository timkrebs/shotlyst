// Package metrics owns the Prometheus registry of a service and the
// standard metrics from docs/08-observability.md §4: HTTP requests by route,
// outbound calls by target and Postgres pool statistics.
//
// It exists so metric names and labels are identical across services and
// dashboards work for all of them. Services only add domain counters (e.g.
// sync_mutations_total) through Register. Nothing here logs.
package metrics

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Registry is one service's metric set. Every application metric carries a
// constant `service` label so per-service dashboards need no relabelling.
type Registry struct {
	reg          *prometheus.Registry
	app          prometheus.Registerer
	httpRequests *prometheus.CounterVec
	httpDuration *prometheus.HistogramVec
	outbound     *prometheus.CounterVec
}

// New creates the registry for service with Go runtime and process
// collectors plus the standard HTTP and outbound metrics.
func New(service string) *Registry {
	reg := prometheus.NewRegistry()
	reg.MustRegister(collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	app := prometheus.WrapRegistererWith(prometheus.Labels{"service": service}, reg)

	r := &Registry{
		reg: reg,
		app: app,
		httpRequests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "HTTP requests handled, by route pattern, method and status.",
		}, []string{"route", "method", "status"}),
		httpDuration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request latency by route pattern.",
			Buckets: []float64{.005, .01, .025, .05, .1, .15, .25, .5, 1, 2.5, 5},
		}, []string{"route"}),
		outbound: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "outbound_requests_total",
			Help: "Calls to other services by target and status (\"error\" for transport failures).",
		}, []string{"target", "status"}),
	}
	app.MustRegister(r.httpRequests, r.httpDuration, r.outbound)
	return r
}

// Register adds service-specific collectors (with the service label).
func (r *Registry) Register(cs ...prometheus.Collector) error {
	for _, c := range cs {
		if err := r.app.Register(c); err != nil {
			return err
		}
	}
	return nil
}

// Handler serves /metrics in the Prometheus text format.
func (r *Registry) Handler() http.Handler {
	return promhttp.HandlerFor(r.reg, promhttp.HandlerOpts{Registry: r.reg})
}

// Middleware records request count and latency. It labels by chi route
// pattern, not raw URL, to keep series cardinality bounded.
func (r *Registry) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, req.ProtoMajor)
		next.ServeHTTP(ww, req)
		status := ww.Status()
		if status == 0 {
			status = http.StatusOK
		}
		route := "unmatched"
		if rc := chi.RouteContext(req.Context()); rc != nil && rc.RoutePattern() != "" {
			route = rc.RoutePattern()
		}
		r.httpRequests.WithLabelValues(route, req.Method, strconv.Itoa(status)).Inc()
		r.httpDuration.WithLabelValues(route).Observe(time.Since(start).Seconds())
	})
}

// ObserveOutbound counts one outbound call; status 0 means the call failed
// before a response arrived and is recorded as "error".
func (r *Registry) ObserveOutbound(target string, status int) {
	s := "error"
	if status > 0 {
		s = strconv.Itoa(status)
	}
	r.outbound.WithLabelValues(target, s).Inc()
}

// RegisterPool exposes pgx pool statistics as db_pool_* metrics, read at
// scrape time so there is no background goroutine.
func (r *Registry) RegisterPool(stat func() *pgxpool.Stat) error {
	return r.Register(&poolCollector{stat: stat})
}

type poolCollector struct{ stat func() *pgxpool.Stat }

var (
	poolAcquired = prometheus.NewDesc("db_pool_acquired_conns", "Connections currently in use.", nil, nil)
	poolIdle     = prometheus.NewDesc("db_pool_idle_conns", "Idle connections.", nil, nil)
	poolTotal    = prometheus.NewDesc("db_pool_total_conns", "Open connections.", nil, nil)
	poolMax      = prometheus.NewDesc("db_pool_max_conns", "Configured maximum connections.", nil, nil)
	poolWaits    = prometheus.NewDesc("db_pool_empty_acquire_total", "Acquires that had to wait for a connection.", nil, nil)
	poolWaitSecs = prometheus.NewDesc("db_pool_acquire_duration_seconds_total", "Total time spent acquiring connections.", nil, nil)
)

// Describe implements prometheus.Collector.
func (c *poolCollector) Describe(ch chan<- *prometheus.Desc) {
	for _, d := range []*prometheus.Desc{poolAcquired, poolIdle, poolTotal, poolMax, poolWaits, poolWaitSecs} {
		ch <- d
	}
}

// Collect implements prometheus.Collector by reading pool stats now.
func (c *poolCollector) Collect(ch chan<- prometheus.Metric) {
	s := c.stat()
	ch <- prometheus.MustNewConstMetric(poolAcquired, prometheus.GaugeValue, float64(s.AcquiredConns()))
	ch <- prometheus.MustNewConstMetric(poolIdle, prometheus.GaugeValue, float64(s.IdleConns()))
	ch <- prometheus.MustNewConstMetric(poolTotal, prometheus.GaugeValue, float64(s.TotalConns()))
	ch <- prometheus.MustNewConstMetric(poolMax, prometheus.GaugeValue, float64(s.MaxConns()))
	ch <- prometheus.MustNewConstMetric(poolWaits, prometheus.CounterValue, float64(s.EmptyAcquireCount()))
	ch <- prometheus.MustNewConstMetric(poolWaitSecs, prometheus.CounterValue, s.AcquireDuration().Seconds())
}
