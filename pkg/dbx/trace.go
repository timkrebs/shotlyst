package dbx

import (
	"context"
	"log/slog"
	"strings"

	"github.com/timkrebs/shotlyst/pkg/logx"
)

func logger(ctx context.Context) *slog.Logger { return logx.From(ctx) }

func logEnabled(ctx context.Context) bool {
	return logger(ctx).Enabled(ctx, slog.LevelDebug)
}

// queryName extracts the sqlc query name from the "-- name: X :one" header
// sqlc prepends to every statement; ad-hoc SQL is reported as "adhoc" so
// statement text (which may contain literals) never reaches the logs.
func queryName(sql string) string {
	const marker = "-- name: "
	if rest, ok := strings.CutPrefix(strings.TrimSpace(sql), marker); ok {
		if name, _, ok := strings.Cut(rest, " "); ok {
			return name
		}
	}
	return "adhoc"
}
