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
}

// New mounts o.Routes under o.Prefix with cfg and pool (nil when the
// service is stateless). The clock is real; services that need a fixed
// clock take it from their own config.
func New[C any](t testing.TB, o app.Options[C], cfg *C, keys Keys, pool *pgxpool.Pool) *Harness {
	t.Helper()
	pub, err := authx.ParsePublicKey(keys.Public)
	if err != nil {
		t.Fatal(err)
	}
	logs := &bytes.Buffer{}
	log := slog.New(slog.NewJSONHandler(logs, &slog.HandlerOptions{Level: slog.LevelDebug}))
	reg := metrics.New(o.Name)
	deps := app.Deps[C]{
		Name: o.Name, Log: log, DB: pool, Auth: authx.NewVerifier(pub, time.Now), Metrics: reg,
		Base: app.Base{BaseURL: "http://localhost:8080"}, Config: cfg, Now: time.Now,
	}
	r := httpx.NewRouter(httpx.RouterOptions{Logger: log, Metrics: reg})
	var routesErr error
	r.Route(o.Prefix, func(r chi.Router) { routesErr = o.Routes(r, deps) })
	if routesErr != nil {
		t.Fatalf("apptest: routes: %v", routesErr)
	}
	return &Harness{t: t, handler: r, keys: keys, Logs: logs}
}

// Token mints a valid session token for userID (random session, 1 h).
func (h *Harness) Token(userID uuid.UUID) string {
	h.t.Helper()
	tok, err := h.keys.Signer.Sign(authx.Claims{UserID: userID, SessionID: uuid.New(), ExpiresAt: time.Now().Add(time.Hour).Unix()})
	if err != nil {
		h.t.Fatal(err)
	}
	return tok
}

// Do sends a request the way the SPA does: JSON body, the CSRF header on
// writes, and token (if non-empty) as a Bearer header.
func (h *Harness) Do(method, path string, body any, token string) *httptest.ResponseRecorder {
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
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
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
