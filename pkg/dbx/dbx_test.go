package dbx_test

import (
	"context"
	"errors"
	"testing"
	"testing/fstest"

	"github.com/jackc/pgx/v5"

	"github.com/timkrebs/shotlyst/pkg/dbx"
	"github.com/timkrebs/shotlyst/pkg/dbx/dbtest"
)

var migrations = fstest.MapFS{
	"0001_items.sql": {Data: []byte(`-- +goose Up
CREATE TABLE items (id int PRIMARY KEY, name text NOT NULL UNIQUE);
`)},
	"0002_items_note.sql": {Data: []byte(`-- +goose Up
ALTER TABLE items ADD COLUMN note text;
`)},
}

func TestMigrateCreatesSchemaAndIsIdempotent(t *testing.T) {
	ctx := context.Background()
	pool := dbtest.Pool(t, "demo", nil)

	from, to, err := dbx.Migrate(ctx, pool, "demo", migrations)
	if err != nil || from != 0 || to != 2 {
		t.Fatalf("first migrate: from=%d to=%d err=%v", from, to, err)
	}
	from, to, err = dbx.Migrate(ctx, pool, "demo", migrations)
	if err != nil || from != 2 || to != 2 {
		t.Fatalf("second migrate: from=%d to=%d err=%v", from, to, err)
	}

	// search_path pins unqualified names to the service schema.
	var schema string
	if err := pool.QueryRow(ctx, `SELECT table_schema FROM information_schema.tables WHERE table_name = 'items'`).Scan(&schema); err != nil || schema != "demo" {
		t.Fatalf("items in schema %q (err %v), want demo", schema, err)
	}
	if err := pool.QueryRow(ctx, `SELECT 1 FROM demo.goose_db_version LIMIT 1`).Scan(new(int)); err != nil {
		t.Fatalf("version table not in service schema: %v", err)
	}
}

func TestTxRollsBackOnError(t *testing.T) {
	ctx := context.Background()
	pool := dbtest.Pool(t, "demo", migrations)

	boom := errors.New("boom")
	err := dbx.Tx(ctx, pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO items (id, name) VALUES (1, 'a')`); err != nil {
			return err
		}
		return boom
	})
	if !errors.Is(err, boom) {
		t.Fatalf("err = %v", err)
	}
	var n int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM items`).Scan(&n)
	if n != 0 {
		t.Fatalf("rollback failed: %d rows", n)
	}
}

func TestMapErr(t *testing.T) {
	ctx := context.Background()
	pool := dbtest.Pool(t, "demo", migrations)

	err := pool.QueryRow(ctx, `SELECT name FROM items WHERE id = 99`).Scan(new(string))
	if !errors.Is(dbx.MapErr(err), dbx.ErrNotFound) {
		t.Errorf("no rows → %v", dbx.MapErr(err))
	}
	_, _ = pool.Exec(ctx, `INSERT INTO items (id, name) VALUES (1, 'a')`)
	_, err = pool.Exec(ctx, `INSERT INTO items (id, name) VALUES (2, 'a')`)
	if !errors.Is(dbx.MapErr(err), dbx.ErrConflict) {
		t.Errorf("unique violation → %v", dbx.MapErr(err))
	}
	other := errors.New("other")
	if dbx.MapErr(other) != other {
		t.Error("unrelated errors must pass through")
	}
	if err := dbx.Ping(ctx, pool); err != nil {
		t.Errorf("ping: %v", err)
	}
}

func TestMain(m *testing.M) { dbtest.Main(m) }
