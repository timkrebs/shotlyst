// Package dbtest gives integration tests a real, migrated Postgres database.
//
// One postgres:16 container is started per test binary (lazily, on first
// use) and every call to Pool gets its own freshly created database, so
// tests can run in parallel without seeing each other's rows. Set
// SHOTLYST_TEST_DATABASE_URL to an admin DSN to reuse an existing server
// instead of starting a container (CI service containers, no Docker).
//
// Packages using Pool call Main from TestMain so the container is removed
// even when testcontainers' reaper is disabled (Podman:
// TESTCONTAINERS_RYUK_DISABLED=true, see README).
//
// It must only be imported from _test.go files.
package dbtest

import (
	"context"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/timkrebs/shotlyst/pkg/dbx"
	"github.com/timkrebs/shotlyst/pkg/ids"
)

// EnvURL names the variable that points tests at an existing server.
const EnvURL = "SHOTLYST_TEST_DATABASE_URL"

var (
	once      sync.Once
	adminURL  string
	startErr  error
	container *postgres.PostgresContainer
)

// Main runs the package's tests and then terminates the shared container.
// Use it as: func TestMain(m *testing.M) { dbtest.Main(m) }.
func Main(m *testing.M) {
	code := m.Run()
	if container != nil {
		_ = container.Terminate(context.Background())
	}
	os.Exit(code)
}

// Pool creates an empty database, applies migrations into schema (skipped
// when migrations is nil) and returns a pool scoped to that schema. The
// database is dropped when the test ends.
func Pool(t testing.TB, schema string, migrations fs.FS) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()
	pool, err := dbx.Open(ctx, URL(t), schema)
	if err != nil {
		t.Fatalf("dbtest: open: %v", err)
	}
	t.Cleanup(pool.Close)
	if migrations != nil {
		if _, _, err := dbx.Migrate(ctx, pool, schema, migrations); err != nil {
			t.Fatalf("dbtest: migrate: %v", err)
		}
	}
	return pool
}

// URL creates an empty database and returns its DSN, for tests that need
// to hand a connection string to code under test (pkg/app). The database
// is dropped when the test ends.
func URL(t testing.TB) string {
	t.Helper()
	ctx := context.Background()
	admin := server(t)
	name := "test_" + strings.ReplaceAll(ids.New().String(), "-", "")[:16]
	conn, err := pgx.Connect(ctx, admin)
	if err != nil {
		t.Fatalf("dbtest: connect admin: %v", err)
	}
	defer func() { _ = conn.Close(ctx) }()
	if _, err := conn.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatalf("dbtest: create database: %v", err)
	}
	t.Cleanup(func() { dropDatabase(admin, name) })
	return withDatabase(t, admin, name)
}

// server returns the admin DSN, starting the shared container on first use.
func server(t testing.TB) string {
	t.Helper()
	once.Do(func() {
		if u := os.Getenv(EnvURL); u != "" {
			adminURL = u
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		c, err := postgres.Run(ctx, "postgres:16-alpine",
			postgres.WithDatabase("shotlyst"),
			postgres.WithUsername("shotlyst"),
			postgres.WithPassword("shotlyst"),
			postgres.BasicWaitStrategies(),
		)
		if err != nil {
			startErr = fmt.Errorf("start postgres container (is Docker/Podman running? or set %s): %w", EnvURL, err)
			return
		}
		container = c
		adminURL, startErr = c.ConnectionString(ctx, "sslmode=disable")
	})
	if startErr != nil {
		t.Fatalf("dbtest: %v", startErr)
	}
	return adminURL
}

func withDatabase(t testing.TB, dsn, db string) string {
	t.Helper()
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatalf("dbtest: parse dsn: %v", err)
	}
	u.Path = "/" + db
	return u.String()
}

func dropDatabase(admin, name string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn, err := pgx.Connect(ctx, admin)
	if err != nil {
		return
	}
	defer func() { _ = conn.Close(ctx) }()
	_, _ = conn.Exec(ctx, "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
}
