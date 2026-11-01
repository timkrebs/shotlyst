// Package identity owns accounts and sessions: register, login, logout,
// token refresh and the current user's profile (docs/04 identity).
//
// It owns the Postgres schema "identity" and is the only holder of the
// session signing key; every other service verifies tokens with the public
// key via pkg/authx and never calls identity per request (ADR-3).
//
// Layout:
//   - identity.go   Prefix, Config, Migrations, Routes
//   - handlers.go   HTTP layer, thin
//   - password.go   argon2id hashing with bounded concurrency
//   - domain/       pure input rules
//   - store/        sqlc queries + transactional helpers
//   - migrations/   goose SQL, embedded via Migrations
package identity

import (
	"crypto/ed25519"
	"crypto/rand"
	"embed"
	"errors"
	"io/fs"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/timkrebs/shotlyst/pkg/app"
	"github.com/timkrebs/shotlyst/pkg/authx"
	"github.com/timkrebs/shotlyst/pkg/httpx"
	"github.com/timkrebs/shotlyst/services/identity/store"
)

// Prefix is the ingress path the API is mounted under (docs/04).
const Prefix = "/api/v1/auth"

// Token and session lifetimes. Tokens are short (docs/02 §4: ≤ 24 h, the
// revocation lag other services accept); the session behind them lives
// longer and slides forward on every refresh.
// TODO(spec): session lifetime is not specified; 30 days of inactivity.
const (
	tokenTTL   = 24 * time.Hour
	sessionTTL = 30 * 24 * time.Hour
)

// Login and register are rate limited per client IP (NFR-6).
const (
	authPerMinute = 10
	authBurst     = 5
)

// Config holds identity's own settings.
type Config struct {
	AuthPrivateKey string `env:"AUTH_PRIVATE_KEY" required:"true" secret:"true"`
}

//go:embed migrations/*.sql
var migrationFiles embed.FS

// Migrations are the embedded goose files for the identity schema.
var Migrations, _ = fs.Sub(migrationFiles, "migrations")

// Routes mounts the identity API. Register and login are public and rate
// limited; logout and refresh read the session cookie themselves (they must
// work with an expired token); /me requires a valid session.
func Routes(r chi.Router, d app.Deps[Config]) error {
	priv, err := authx.ParsePrivateKey(d.Config.AuthPrivateKey)
	if err != nil {
		return err
	}
	// A mismatched pair would issue tokens no service accepts; fail at
	// startup with a clear message instead of 401s at runtime.
	if pub, _ := authx.ParsePublicKey(d.Base.AuthPublicKey); !pub.Equal(priv.Public().(ed25519.PublicKey)) {
		return errors.New("SHOTLYST_AUTH_PRIVATE_KEY does not match SHOTLYST_AUTH_PUBLIC_KEY")
	}

	h := &handlers{
		store:    store.NewStore(d.DB),
		signer:   authx.NewSigner(priv),
		verifier: d.Auth,
		hasher:   newHasher(rand.Reader),
		now:      d.Now,
		secure:   strings.HasPrefix(d.Base.BaseURL, "https://"),
	}
	limiter := httpx.NewRateLimiter(authPerMinute, authBurst, d.Now)

	r.Group(func(r chi.Router) {
		r.Use(limiter.Middleware)
		r.Post("/register", h.register)
		r.Post("/login", h.login)
	})
	r.Post("/logout", h.logout)
	r.Post("/refresh", h.refresh)
	r.Group(func(r chi.Router) {
		r.Use(d.Auth.RequireUser)
		r.Get("/me", h.getMe)
		r.Patch("/me", h.patchMe)
	})
	return nil
}
