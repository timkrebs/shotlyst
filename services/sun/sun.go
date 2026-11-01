// Package sun is the stateless sun-times service: sunrise, sunset,
// twilight, golden and blue hour for a location and date (FR-7, ADR-6).
//
// It owns no database and calls no other service; the astronomy lives in
// domain/ and is pure. This package is the template every other service
// copies: Prefix + Config + Routes here, a one-line cmd/sun/main.go, the
// contract in api/sun.yaml. It must not grow business logic in handlers.
package sun

import (
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/timkrebs/shotlyst/pkg/app"
	"github.com/timkrebs/shotlyst/pkg/clientx"
	"github.com/timkrebs/shotlyst/services/sun/domain"
)

// Prefix is the ingress path the API is mounted under (docs/04).
const Prefix = "/api/v1/sun"

// cacheTTL and cacheSize bound the in-process result cache (docs/04: 1 h).
// Sun times for a place and day never change, so the TTL only limits memory.
const (
	cacheTTL  = time.Hour
	cacheSize = 2048
)

// Config holds sun's own settings; it has none yet beyond app.Base.
type Config struct{}

// Routes mounts the sun API. Every endpoint requires a session (NFR-6):
// the SPA calls it directly and planning forwards the user's token.
func Routes(r chi.Router, d app.Deps[Config]) error {
	h := &handlers{cache: clientx.NewCache[cacheKey, domain.Times](cacheTTL, cacheSize, d.Now)}
	// Group (not Use) applies auth after routing, so even a 401 is logged
	// with its full route pattern.
	r.Group(func(r chi.Router) {
		r.Use(d.Auth.RequireUser)
		r.Get("/times", h.times)
	})
	return nil
}
