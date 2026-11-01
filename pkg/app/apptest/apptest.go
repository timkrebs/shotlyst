// Package apptest runs a service's routes behind the real middleware stack
// for handler tests: same router, CSRF check, auth, problem responses and
// JSON log lines as in production, but in-process and with a test keypair.
//
// It exists so every service's handler tests look the same and none of
// them re-implements token minting or request plumbing. Import it only
// from _test.go files.
package apptest

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/timkrebs/shotlyst/pkg/app"
	"github.com/timkrebs/shotlyst/pkg/authx"
	"github.com/timkrebs/shotlyst/pkg/httpx"
	"github.com/timkrebs/shotlyst/pkg/metrics"
)

// Keys is a fresh session keypair in config (base64) form plus a signer
// for minting test tokens.
type Keys struct {
	Private string
	Public  string
	Signer  *authx.Signer
}

// NewKeys generates a keypair; pass Private into the identity config.
func NewKeys(t testing.TB) Keys {
	t.Helper()
	var env bytes.Buffer
	if err := authx.WriteKeyEnv(&env, rand.Reader); err != nil {
		t.Fatal(err)
	}
	var k Keys
	for _, line := range strings.Split(strings.TrimSpace(env.String()), "\n") {
		name, val, _ := strings.Cut(line, "=")
		switch name {
		case "SHOTLYST_AUTH_PRIVATE_KEY":
			k.Private = val
		case "SHOTLYST_AUTH_PUBLIC_KEY":
			k.Public = val
		}
	}
	priv, err := authx.ParsePrivateKey(k.Private)
	if err != nil {
		t.Fatal(err)
	}
	k.Signer = authx.NewSigner(priv)
	return k
}

// Harness is a service mounted on the standard router.
type Harness struct {
	t       testing.TB
	handler http.Handler
	keys    Keys
	// Logs receives every JSON log line the service writes.
	Logs *bytes.Buffer

	mu     sync.Mutex
	offset time.Duration
}

// New mounts o.Routes under o.Prefix with cfg and pool (nil when the
// service is stateless). The service and the token verifier share the
// harness clock: real time shifted by Advance.
func New[C any](t testing.TB, o app.Options[C], cfg *C, keys Keys, pool *pgxpool.Pool) *Harness {
	t.Helper()
	h := &Harness{t: t, keys: keys, Logs: &bytes.Buffer{}}
	pub, err := authx.ParsePublicKey(keys.Public)
	if err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewJSONHandler(h.Logs, &slog.HandlerOptions{Level: slog.LevelDebug}))
	reg := metrics.New(o.Name)
	deps := app.Deps[C]{
		Name: o.Name, Log: log, DB: pool, Auth: authx.NewVerifier(pub, h.Now), Metrics: reg,
		Base: app.Base{BaseURL: "http://localhost:8080", AuthPublicKey: keys.Public}, Config: cfg, Now: h.Now,
	}
	r := httpx.NewRouter(httpx.RouterOptions{Logger: log, Metrics: reg})
	var routesErr error
	r.Route(o.Prefix, func(r chi.Router) { routesErr = o.Routes(r, deps) })
	if routesErr != nil {
		t.Fatalf("apptest: routes: %v", routesErr)
	}
	h.handler = r
	return h
}

// Now is the harness clock.
func (h *Harness) Now() time.Time {
	h.mu.Lock()
	defer h.mu.Unlock()
	return time.Now().Add(h.offset)
}

// Advance moves the harness clock forward, e.g. past a token's expiry.
func (h *Harness) Advance(d time.Duration) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.offset += d
}

// Token mints a valid session token for userID (random session, 1 h).
func (h *Harness) Token(userID uuid.UUID) string {
	h.t.Helper()
	tok, err := h.keys.Signer.Sign(authx.Claims{UserID: userID, SessionID: uuid.New(), ExpiresAt: h.Now().Add(time.Hour).Unix()})
	if err != nil {
		h.t.Fatal(err)
	}
	return tok
}

// Do sends a request the way the SPA does: JSON body, the CSRF header on
// writes, and token (if non-empty) as a Bearer header.
func (h *Harness) Do(method, path string, body any, token string) *httptest.ResponseRecorder {
	h.t.Helper()
	return h.DoWith(method, path, body, func(r *http.Request) {
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
	})
}

// DoWith is Do with a hook to adjust the request (cookies, missing CSRF
// header, client address).
func (h *Harness) DoWith(method, path string, body any, mod func(*http.Request)) *httptest.ResponseRecorder {
	h.t.Helper()
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			h.t.Fatal(err)
		}
		rd = bytes.NewReader(b)
	}
	req := httptest.NewRequestWithContext(context.Background(), method, path, rd)
	req.Header.Set("Content-Type", "application/json")
	if method != http.MethodGet {
		req.Header.Set(httpx.HeaderClient, "web")
	}
	mod(req)
	rec := httptest.NewRecorder()
	h.handler.ServeHTTP(rec, req)
	return rec
}

// JSON decodes a response body into a generic map, failing the test on
// invalid JSON.
func JSON(t testing.TB, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("response is not JSON (%d): %s", rec.Code, rec.Body)
	}
	return m
}
