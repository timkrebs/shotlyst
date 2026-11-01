// Package app is the whole lifecycle of a Shotlyst service: load config,
// build the logger, open and migrate the database, mount routes behind the
// standard middleware, serve, and drain on SIGTERM. It also implements the
// `<service> migrate` subcommand the Helm pre-upgrade hook Job runs.
//
// Every cmd/<service>/main.go calls Run and nothing else, so wiring is
// written once and services differ only in their Options. This package
// must not contain service-specific behaviour.
package app

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"
	_ "time/tzdata" // distroless images ship no zoneinfo; sun and planning need IANA zones

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/timkrebs/shotlyst/pkg/authx"
	"github.com/timkrebs/shotlyst/pkg/config"
	"github.com/timkrebs/shotlyst/pkg/dbx"
	"github.com/timkrebs/shotlyst/pkg/httpx"
	"github.com/timkrebs/shotlyst/pkg/logx"
	"github.com/timkrebs/shotlyst/pkg/metrics"
)

// EnvPrefix is the prefix of every Shotlyst environment variable.
const EnvPrefix = "SHOTLYST_"

// Base is the configuration every service shares. Service-specific
// settings live in the service's own config struct (Options type C).
type Base struct {
	Addr            string        `env:"ADDR" default:":8080"`
	BaseURL         string        `env:"BASE_URL" default:"http://localhost:8080"`
	LogLevel        string        `env:"LOG_LEVEL" default:"info"`
	LogFormat       string        `env:"LOG_FORMAT" default:"text"`
	DatabaseURL     string        `env:"DATABASE_URL" secret:"true"`
	AutoMigrate     bool          `env:"AUTO_MIGRATE" default:"false"`
	AuthPublicKey   string        `env:"AUTH_PUBLIC_KEY" required:"true"`
	RequestTimeout  time.Duration `env:"REQUEST_TIMEOUT" default:"30s"`
	TrustedProxies  int           `env:"TRUSTED_PROXIES" default:"1"`
	ShutdownTimeout time.Duration `env:"SHUTDOWN_TIMEOUT" default:"15s"`
	Pod             string        `env:"POD_NAME,noprefix"`
	Namespace       string        `env:"POD_NAMESPACE,noprefix"`
	Node            string        `env:"NODE_NAME,noprefix"`
}

// Options is everything that distinguishes one service from another. C is
// the service's own config struct (use struct{} when it has none).
type Options[C any] struct {
	Name       string // service name: log field, metric label
	Version    string // injected via -ldflags "-X main.version=…"
	Prefix     string // ingress path prefix the API is mounted under, e.g. /api/v1/sun
	Schema     string // Postgres schema owned by the service; "" when stateless
	Migrations fs.FS  // embedded goose files; nil means the service has no database
	Routes     func(r chi.Router, d Deps[C]) error
}

// Deps is what a service's Routes function gets to build its handlers.
type Deps[C any] struct {
	Name    string
	Log     *slog.Logger
	DB      *pgxpool.Pool // nil for stateless services
	Auth    *authx.Verifier
	Metrics *metrics.Registry
	Base    Base
	Config  *C
	Now     func() time.Time
}

// Run starts the service (or runs `migrate`) and exits the process. It
// never returns.
func Run[C any](o Options[C]) {
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT)
	os.Exit(run(o, env{args: os.Args[1:], lookup: os.LookupEnv, out: os.Stdout, signals: sig}))
}

// env is the process surface run touches, injectable for tests.
type env struct {
	args     []string
	lookup   config.Lookup
	out      io.Writer
	signals  <-chan os.Signal
	onListen func(addr string)
}

func run[C any](o Options[C], e env) int {
	var base Base
	baseErr := config.LoadFrom(e.lookup, EnvPrefix, &base)
	log, err := logx.New(logx.Options{Service: o.Name, Version: o.Version, Pod: base.Pod,
		Namespace: base.Namespace, Node: base.Node, Level: base.LogLevel, Format: base.LogFormat, Out: e.out})
	if err != nil {
		_, _ = fmt.Fprintf(e.out, "invalid logging configuration: %v\n", err)
		return 2
	}
	slog.SetDefault(log)

	cfg := new(C)
	cfgErr := config.LoadFrom(e.lookup, EnvPrefix, cfg)
	log.Info("starting", "config", redacted(&base, cfg))
	if err := errors.Join(baseErr, cfgErr, requireDB(o, base)); err != nil {
		log.Error("invalid configuration", "error", err.Error())
		return 2
	}

	ctx := context.Background()
	if len(e.args) > 0 && e.args[0] == "migrate" {
		return migrateOnly(ctx, o, base, log)
	}
	if err := serve(ctx, o, base, cfg, log, e); err != nil {
		log.Error("stopped with error", "error", err.Error())
		return 1
	}
	return 0
}

func redacted(cfgs ...any) map[string]string {
	out := map[string]string{}
	for _, c := range cfgs {
		for k, v := range config.Redacted(EnvPrefix, c) {
			out[k] = v
		}
	}
	return out
}

func requireDB[C any](o Options[C], b Base) error {
	if o.Migrations != nil && b.DatabaseURL == "" {
		return fmt.Errorf("config: %sDATABASE_URL is required for %s", EnvPrefix, o.Name)
	}
	return nil
}

// migrateOnly is the Helm hook Job entry point: wait for Postgres, apply
// migrations, exit. It waits because on first install the database comes
// up alongside the Job.
func migrateOnly[C any](ctx context.Context, o Options[C], b Base, log *slog.Logger) int {
	if o.Migrations == nil {
		log.Info("no migrations for this service")
		return 0
	}
	pool, err := dbx.Open(ctx, b.DatabaseURL, o.Schema)
	if err != nil {
		log.Error("migrate failed", "error", err.Error())
		return 1
	}
	defer pool.Close()
	if err := dbx.WaitReady(ctx, pool, 2*time.Minute); err != nil {
		log.Error("migrate failed", "error", err.Error())
		return 1
	}
	if err := migrate(ctx, o, pool, log); err != nil {
		log.Error("migrate failed", "error", err.Error())
		return 1
	}
	return 0
}

func migrate[C any](ctx context.Context, o Options[C], pool *pgxpool.Pool, log *slog.Logger) error {
	from, to, err := dbx.Migrate(ctx, pool, o.Schema, o.Migrations)
	if err != nil {
		return err
	}
	log.Info("migrations applied", "schema", o.Schema, "from", from, "to", to)
	return nil
}

// serve runs the HTTP server until a signal arrives, then drains in-flight
// requests for up to ShutdownTimeout (the pod's terminationGracePeriod is
// a few seconds longer).
func serve[C any](ctx context.Context, o Options[C], b Base, cfg *C, log *slog.Logger, e env) error {
	pub, err := authx.ParsePublicKey(b.AuthPublicKey)
	if err != nil {
		return err
	}
	reg := metrics.New(o.Name)
	deps := Deps[C]{Name: o.Name, Log: log, Auth: authx.NewVerifier(pub, time.Now), Metrics: reg,
		Base: b, Config: cfg, Now: time.Now}

	var checks []httpx.Check
	if o.Migrations != nil {
		if deps.DB, err = openDB(ctx, o, b, reg, log); err != nil {
			return err
		}
		defer deps.DB.Close()
		pool := deps.DB
		checks = append(checks, httpx.Check{Name: "postgres", Fn: func(ctx context.Context) error { return dbx.Ping(ctx, pool) }})
	}

	router := httpx.NewRouter(httpx.RouterOptions{Logger: log, Metrics: reg, Ready: checks,
		Timeout: b.RequestTimeout, TrustedProxies: b.TrustedProxies})
	var routesErr error
	router.Route(o.Prefix, func(r chi.Router) { routesErr = o.Routes(r, deps) })
	if routesErr != nil {
		return fmt.Errorf("mount routes: %w", routesErr)
	}

	var inFlight atomic.Int64
	srv := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			inFlight.Add(1)
			defer inFlight.Add(-1)
			router.ServeHTTP(w, r)
		}),
		ReadHeaderTimeout: 10 * time.Second,
	}
	ln, err := (&net.ListenConfig{}).Listen(ctx, "tcp", b.Addr)
	if err != nil {
		return fmt.Errorf("listen %s: %w", b.Addr, err)
	}
	log.Info("listening", "addr", ln.Addr().String())
	if e.onListen != nil {
		e.onListen(ln.Addr().String())
	}

	served := make(chan error, 1)
	go func() { served <- srv.Serve(ln) }()
	select {
	case err := <-served:
		return fmt.Errorf("serve: %w", err)
	case s := <-e.signals:
		log.Info("shutting down", "signal", s.String(), "in_flight", inFlight.Load())
	}
	sctx, cancel := context.WithTimeout(ctx, b.ShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(sctx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	log.Info("stopped")
	return nil
}

// openDB opens the pool and, when AUTO_MIGRATE is set (Compose only),
// migrates. A database that is down at startup is logged but not fatal:
// the pod stays alive and /readyz reports it until Postgres returns.
func openDB[C any](ctx context.Context, o Options[C], b Base, reg *metrics.Registry, log *slog.Logger) (*pgxpool.Pool, error) {
	pool, err := dbx.Open(ctx, b.DatabaseURL, o.Schema)
	if err != nil {
		return nil, err
	}
	if err := reg.RegisterPool(pool.Stat); err != nil {
		pool.Close()
		return nil, fmt.Errorf("register pool metrics: %w", err)
	}
	if err := dbx.Ping(ctx, pool); err != nil {
		log.Warn("dependency unavailable", "dependency", "postgres", "error", err.Error())
	}
	if b.AutoMigrate {
		if err := dbx.WaitReady(ctx, pool, time.Minute); err != nil {
			pool.Close()
			return nil, err
		}
		if err := migrate(ctx, o, pool, log); err != nil {
			pool.Close()
			return nil, err
		}
	}
	return pool, nil
}
