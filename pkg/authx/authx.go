// Package authx implements Shotlyst's stateless session tokens (ADR-3):
// Ed25519 signing in identity, verification in every service, the session
// cookie and the RequireUser middleware that puts the user id in the
// request context.
//
// Statelessness is the point: services verify a token with the public key
// alone and never call identity per request. The trade-off (a revoked
// session stays valid until exp, at most 24 h) is documented in docs/02 §4.
// Only identity may hold the private key; this package must not talk to the
// database or to other services.
package authx

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/timkrebs/shotlyst/pkg/httpx"
	"github.com/timkrebs/shotlyst/pkg/logx"
)

// CookieName is the HttpOnly session cookie set by identity.
const CookieName = "shotlyst_session"

var (
	// ErrInvalidToken covers malformed tokens and bad signatures.
	ErrInvalidToken = errors.New("invalid session token")
	// ErrExpired means the signature is valid but exp has passed; the SPA
	// should have called /auth/refresh earlier.
	ErrExpired = errors.New("session token expired")
)

var b64 = base64.RawURLEncoding

// Claims is the signed token payload: who (sub), which session (sid, so
// identity can revoke or refresh it) and until when (exp, unix seconds).
type Claims struct {
	UserID    uuid.UUID `json:"sub"`
	SessionID uuid.UUID `json:"sid"`
	ExpiresAt int64     `json:"exp"`
}

// Signer issues tokens. Only identity constructs one.
type Signer struct{ key ed25519.PrivateKey }

// NewSigner wraps the private key from SHOTLYST_AUTH_PRIVATE_KEY.
func NewSigner(key ed25519.PrivateKey) *Signer { return &Signer{key: key} }

// Sign encodes c as base64url(json) + "." + base64url(signature).
func (s *Signer) Sign(c Claims) (string, error) {
	payload, err := json.Marshal(c)
	if err != nil {
		return "", fmt.Errorf("encode claims: %w", err)
	}
	p := b64.EncodeToString(payload)
	return p + "." + b64.EncodeToString(ed25519.Sign(s.key, []byte(p))), nil
}

// Verifier checks tokens in every service with the public key.
type Verifier struct {
	key ed25519.PublicKey
	now func() time.Time
}

// NewVerifier wraps the public key; now is injectable for expiry tests.
func NewVerifier(key ed25519.PublicKey, now func() time.Time) *Verifier {
	return &Verifier{key: key, now: now}
}

// Verify returns the claims of a well-formed, correctly signed, unexpired
// token.
func (v *Verifier) Verify(token string) (Claims, error) {
	c, err := v.VerifyForRefresh(token)
	if err != nil {
		return Claims{}, err
	}
	if v.now().Unix() >= c.ExpiresAt {
		return Claims{}, ErrExpired
	}
	return c, nil
}

// VerifyForRefresh checks format and signature but not expiry. Only
// identity's /refresh and /logout use it: an expired token may be exchanged
// for a new one while its server-side session is still live, which is what
// keeps a user logged in across days without long-lived tokens.
func (v *Verifier) VerifyForRefresh(token string) (Claims, error) {
	p, sig, ok := strings.Cut(token, ".")
	if !ok {
		return Claims{}, ErrInvalidToken
	}
	rawSig, err := b64.DecodeString(sig)
	if err != nil || !ed25519.Verify(v.key, []byte(p), rawSig) {
		return Claims{}, ErrInvalidToken
	}
	payload, err := b64.DecodeString(p)
	if err != nil {
		return Claims{}, ErrInvalidToken
	}
	var c Claims
	dec := json.NewDecoder(bytes.NewReader(payload))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&c); err != nil || c.UserID == uuid.Nil || c.SessionID == uuid.Nil {
		return Claims{}, ErrInvalidToken
	}
	return c, nil
}

// ParsePublicKey decodes the base64 (std) public key from config.
func ParsePublicKey(s string) (ed25519.PublicKey, error) {
	b, err := base64.StdEncoding.DecodeString(s)
	if err != nil || len(b) != ed25519.PublicKeySize {
		return nil, errors.New("auth public key must be base64 of 32 bytes")
	}
	return ed25519.PublicKey(b), nil
}

// ParsePrivateKey decodes the base64 (std) 32-byte seed from config. The
// seed form is used because it is half as long and fully determines the key.
func ParsePrivateKey(s string) (ed25519.PrivateKey, error) {
	b, err := base64.StdEncoding.DecodeString(s)
	if err != nil || len(b) != ed25519.SeedSize {
		return nil, errors.New("auth private key must be base64 of a 32-byte seed")
	}
	return ed25519.NewKeyFromSeed(b), nil
}

// WriteKeyEnv generates a keypair and writes it as .env lines, so
// `go run ./cmd/keygen >> .env` bootstraps local development.
func WriteKeyEnv(w io.Writer, rand io.Reader) error {
	pub, priv, err := ed25519.GenerateKey(rand)
	if err != nil {
		return fmt.Errorf("generate key: %w", err)
	}
	_, err = fmt.Fprintf(w, "SHOTLYST_AUTH_PRIVATE_KEY=%s\nSHOTLYST_AUTH_PUBLIC_KEY=%s\n",
		base64.StdEncoding.EncodeToString(priv.Seed()), base64.StdEncoding.EncodeToString(pub))
	return err
}

// SetCookie stores token in the session cookie. Secure follows the public
// base URL scheme so local http development still works.
func SetCookie(w http.ResponseWriter, token string, exp time.Time, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name: CookieName, Value: token, Path: "/", Expires: exp,
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
	})
}

// ClearCookie removes the session cookie (logout).
func ClearCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name: CookieName, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
	})
}

// TokenFromRequest reads the cookie (browser) or a Bearer header
// (service-to-service calls forward the user's token that way).
func TokenFromRequest(r *http.Request) string {
	if c, err := r.Cookie(CookieName); err == nil && c.Value != "" {
		return c.Value
	}
	if h, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); ok {
		return h
	}
	return ""
}

type ctxKey struct{}

type session struct {
	claims Claims
	token  string
}

// WithSession stores verified claims and the raw token in ctx. RequireUser
// calls it; tests use it to fake an authenticated request.
func WithSession(ctx context.Context, c Claims, token string) context.Context {
	ctx = logx.SetUser(ctx, c.UserID.String())
	return context.WithValue(ctx, ctxKey{}, session{claims: c, token: token})
}

func from(ctx context.Context) session {
	s, _ := ctx.Value(ctxKey{}).(session)
	return s
}

// UserID returns the authenticated user, or uuid.Nil outside RequireUser.
// Every store query on user data filters by it.
func UserID(ctx context.Context) uuid.UUID { return from(ctx).claims.UserID }

// SessionID returns the authenticated session id.
func SessionID(ctx context.Context) uuid.UUID { return from(ctx).claims.SessionID }

// Token returns the caller's raw token so clientx can forward it; services
// never mint their own credentials for internal calls.
func Token(ctx context.Context) string { return from(ctx).token }

// RequireUser rejects requests without a valid token (401 problem+json)
// and otherwise makes the user available via UserID and on every log line.
func (v *Verifier) RequireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := TokenFromRequest(r)
		if token == "" {
			httpx.ProblemUnauthorized(w, r, "no session")
			return
		}
		c, err := v.Verify(token)
		if err != nil {
			httpx.ProblemUnauthorized(w, r, err.Error())
			return
		}
		next.ServeHTTP(w, r.WithContext(WithSession(r.Context(), c, token)))
	})
}
