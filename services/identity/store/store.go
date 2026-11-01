// Package store is identity's data access: sqlc-generated queries
// (queries/*.sql → *.sql.go, do not edit those) plus the few hand-written
// helpers that need a transaction. Every query except the login lookup by
// email is scoped by user id.
package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/timkrebs/shotlyst/pkg/dbx"
)

// Store adds transactional operations to the generated Queries.
type Store struct {
	*Queries
	pool *pgxpool.Pool
}

// NewStore wraps a pool scoped to the identity schema.
func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{Queries: New(pool), pool: pool}
}

// CreateUserWithSession registers a user and opens their first session
// atomically, so a failed session insert never leaves an account the user
// cannot know was created. A taken email returns dbx.ErrConflict.
func (s *Store) CreateUserWithSession(ctx context.Context, u CreateUserParams, sess CreateSessionParams) (User, error) {
	var user User
	err := dbx.Tx(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.WithTx(tx)
		var err error
		if user, err = q.CreateUser(ctx, u); err != nil {
			return fmt.Errorf("create user: %w", dbx.MapErr(err))
		}
		if err := q.CreateSession(ctx, sess); err != nil {
			return fmt.Errorf("create session: %w", err)
		}
		return nil
	})
	return user, err
}
