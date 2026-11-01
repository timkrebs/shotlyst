// Package logx implements the logging contract of docs/08-observability.md
// once, so every service emits identical JSON lines that Loki can join on
// pod, request and user.
//
// It owns: the base logger (service/version/pod/namespace/node on every
// line), carrying a request-scoped logger in the context, the request
// middleware (request id, one "request completed" line per request, panic
// recovery) and small redaction helpers. Service code only ever calls
// From(ctx). This package must not depend on other pkg/ packages; httpx,
// authx and clientx build on it, not the other way round.
package logx

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"time"
)

// Options describes the process identity stamped on every line. Pod,
// Namespace and Node come from the Kubernetes Downward API so a log line is
// attributable to one pod even after it is gone.
type Options struct {
	Service   string
	Version   string
	Pod       string
	Namespace string
	Node      string
	Level     string    // debug | info | warn | error; default info
	Format    string    // json | text; default text (json in the cluster)
	Out       io.Writer // required
}

// New builds the base logger for a service. Times are UTC so lines from
// different pods sort correctly regardless of node timezone.
func New(o Options) (*slog.Logger, error) {
	level, err := ParseLevel(o.Level)
	if err != nil {
		return nil, err
	}
	ho := &slog.HandlerOptions{
		Level: level,
		ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
			if a.Key == slog.TimeKey && a.Value.Kind() == slog.KindTime {
				a.Value = slog.TimeValue(a.Value.Time().UTC())
			}
			return a
		},
	}
	var h slog.Handler
	switch o.Format {
	case "json":
		h = slog.NewJSONHandler(o.Out, ho)
	case "text", "":
		h = slog.NewTextHandler(o.Out, ho)
	default:
		return nil, fmt.Errorf("logx: unknown format %q (want json or text)", o.Format)
	}
	return slog.New(h).With(
		"service", o.Service,
		"version", o.Version,
		"pod", o.Pod,
		"namespace", o.Namespace,
		"node", o.Node,
	), nil
}

// ParseLevel maps the SHOTLYST_LOG_LEVEL values to slog levels.
func ParseLevel(s string) (slog.Level, error) {
	switch strings.ToLower(s) {
	case "debug":
		return slog.LevelDebug, nil
	case "info", "":
		return slog.LevelInfo, nil
	case "warn":
		return slog.LevelWarn, nil
	case "error":
		return slog.LevelError, nil
	}
	return 0, fmt.Errorf("logx: unknown level %q", s)
}

type ctxKey int

const (
	loggerKey ctxKey = iota
	stateKey
)

// With returns a context carrying l; From(ctx) will return it.
func With(ctx context.Context, l *slog.Logger) context.Context {
	return context.WithValue(ctx, loggerKey, l)
}

// From returns the request-scoped logger (already carrying request_id and,
// once authenticated, user_id). Outside a request it falls back to
// slog.Default so callers never have to nil-check.
func From(ctx context.Context) *slog.Logger {
	if l, ok := ctx.Value(loggerKey).(*slog.Logger); ok {
		return l
	}
	return slog.Default()
}

// Redact shortens an email to its first letter and domain (t***@gmail.com)
// so logs can distinguish users without storing full addresses.
func Redact(email string) string {
	local, domain, ok := strings.Cut(email, "@")
	if !ok || local == "" {
		return "***"
	}
	return local[:1] + "***@" + domain
}

// Since returns the elapsed milliseconds as the integer that docs/08 uses
// for duration_ms, so every package reports durations the same way.
func Since(start time.Time) int64 {
	return time.Since(start).Milliseconds()
}
