// Package dbx is the shared Postgres layer: pool construction scoped to one
// service schema, the goose migration runner, the transaction helper and the
// error sentinels that handlers map to HTTP statuses.
//
// Every DB-backed service owns exactly one schema (docs/02 §4, ADR-2). Open
// pins search_path to that schema so unqualified SQL in sqlc queries can
// never reach another service's tables. This package must not contain
// service queries; those live in services/<svc>/queries.
package dbx

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io/fs"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/database"
)

// ErrNotFound means the row does not exist or belongs to another user.
// Handlers map it to 404 — never 403, so ids of other users stay opaque.
var ErrNotFound = errors.New("not found")

// ErrConflict means a uniqueness or state rule rejected the write (409).
var ErrConflict = errors.New("conflict")

// Open creates a pool whose connections use search_path=schema. It does not
// ping: a service must start (and report not-ready) while Postgres is down,
// so connectivity is checked by Ping from /readyz instead.
func Open(ctx context.Context, url, schema string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	if schema != "" {
		cfg.ConnConfig.RuntimeParams["search_path"] = schema
	}
	cfg.ConnConfig.Tracer = queryTracer{}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("open pool: %w", err)
	}
	return pool, nil
}

// Ping checks connectivity with a short timeout; used by /readyz.
func Ping(ctx context.Context, pool *pgxpool.Pool) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	return pool.Ping(ctx)
}

// WaitReady pings until Postgres answers or timeout elapses. The migrate
// hook Job uses it because on first install it starts alongside the
// database and would otherwise fail and back off for minutes.
func WaitReady(ctx context.Context, pool *pgxpool.Pool, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		err := Ping(ctx, pool)
		if err == nil {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("postgres not ready after %s: %w", timeout, err)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
}

// Migrate applies the embedded goose migrations of one service and returns
// the schema version before and after. The schema is created when missing
// (Compose, tests); in the cluster it already exists and the service role
// may lack CREATE on the database, hence the existence check first. The
// version table lives inside the schema so services never share it.
func Migrate(ctx context.Context, pool *pgxpool.Pool, schema string, migrations fs.FS) (from, to int64, err error) {
	var exists bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1)`, schema).Scan(&exists); err != nil {
		return 0, 0, fmt.Errorf("check schema %s: %w", schema, err)
	}
	if !exists {
		if _, err := pool.Exec(ctx, "CREATE SCHEMA "+pgx.Identifier{schema}.Sanitize()); err != nil {
			return 0, 0, fmt.Errorf("create schema %s: %w", schema, err)
		}
	}

	db := stdlib.OpenDBFromPool(pool)
	defer func() { _ = db.Close() }()
	p, err := newProvider(db, schema, migrations)
	if err != nil {
		return 0, 0, err
	}
	if from, err = p.GetDBVersion(ctx); err != nil && !errors.Is(err, goose.ErrNoCurrentVersion) {
		return 0, 0, fmt.Errorf("read migration version: %w", err)
	}
	if _, err := p.Up(ctx); err != nil {
		return from, 0, fmt.Errorf("apply migrations: %w", err)
	}
	if to, err = p.GetDBVersion(ctx); err != nil {
		return from, 0, fmt.Errorf("read migration version: %w", err)
	}
	return from, to, nil
}

func newProvider(db *sql.DB, schema string, migrations fs.FS) (*goose.Provider, error) {
	store, err := database.NewStore(goose.DialectPostgres, schema+".goose_db_version")
	if err != nil {
		return nil, fmt.Errorf("migration store: %w", err)
	}
	p, err := goose.NewProvider("", db, migrations, goose.WithStore(store))
	if err != nil {
		return nil, fmt.Errorf("migration provider: %w", err)
	}
	return p, nil
}

// Tx runs fn in a transaction, committing on nil and rolling back on error
// or panic. Every multi-row write (reorder, sync, duplicate) goes through it
// so a failure never leaves half-applied state.
func Tx(ctx context.Context, pool *pgxpool.Pool, fn func(pgx.Tx) error) error {
	return pgx.BeginFunc(ctx, pool, fn)
}

// MapErr translates driver errors into the package sentinels so handlers
// stay free of pgx: no rows → ErrNotFound, unique violation → ErrConflict.
// Other errors pass through unchanged.
func MapErr(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return fmt.Errorf("%w: %s", ErrConflict, pgErr.ConstraintName)
	}
	return err
}

// queryTracer logs sqlc query names and durations at DEBUG
// (SHOTLYST_LOG_LEVEL=debug), through the request logger so lines carry the
// request id. At INFO it costs one Enabled check per query.
type queryTracer struct{}

type traceKey struct{}

type traceStart struct {
	name  string
	start time.Time
}

// TraceQueryStart implements pgx.QueryTracer; it only records state when
// DEBUG is enabled.
func (queryTracer) TraceQueryStart(ctx context.Context, _ *pgx.Conn, d pgx.TraceQueryStartData) context.Context {
	if !logEnabled(ctx) {
		return ctx
	}
	return context.WithValue(ctx, traceKey{}, traceStart{name: queryName(d.SQL), start: time.Now()})
}

// TraceQueryEnd implements pgx.QueryTracer and writes the "sql" line.
func (queryTracer) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, d pgx.TraceQueryEndData) {
	ts, ok := ctx.Value(traceKey{}).(traceStart)
	if !ok {
		return
	}
	attrs := []any{"query", ts.name, "duration_ms", time.Since(ts.start).Milliseconds()}
	if d.Err != nil {
		attrs = append(attrs, "error", d.Err.Error())
	}
	logger(ctx).Debug("sql", attrs...)
}
