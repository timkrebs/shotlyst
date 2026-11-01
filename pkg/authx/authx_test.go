package authx

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func keys(t *testing.T) (*Signer, *Verifier, *time.Time) {
	t.Helper()
	var env bytes.Buffer
	if err := WriteKeyEnv(&env, rand.Reader); err != nil {
		t.Fatal(err)
	}
	vals := map[string]string{}
	for _, l := range strings.Split(strings.TrimSpace(env.String()), "\n") {
		k, v, _ := strings.Cut(l, "=")
		vals[k] = v
	}
	priv, err := ParsePrivateKey(vals["SHOTLYST_AUTH_PRIVATE_KEY"])
	if err != nil {
		t.Fatal(err)
	}
	pub, err := ParsePublicKey(vals["SHOTLYST_AUTH_PUBLIC_KEY"])
	if err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1_800_000_000, 0)
	return NewSigner(priv), NewVerifier(pub, func() time.Time { return now }), &now
}

func claims(now time.Time) Claims {
	return Claims{UserID: uuid.New(), SessionID: uuid.New(), ExpiresAt: now.Add(time.Hour).Unix()}
}

func TestSignVerifyRoundTrip(t *testing.T) {
	s, v, now := keys(t)
	c := claims(*now)
	tok, err := s.Sign(c)
	if err != nil {
		t.Fatal(err)
	}
	got, err := v.Verify(tok)
	if err != nil || got != c {
		t.Fatalf("Verify = %+v, %v", got, err)
	}
}

func TestVerifyExpiry(t *testing.T) {
	s, v, now := keys(t)
	tok, _ := s.Sign(claims(*now))
	*now = now.Add(time.Hour) // exactly at exp counts as expired
	if _, err := v.Verify(tok); !errors.Is(err, ErrExpired) {
		t.Fatalf("err = %v, want ErrExpired", err)
	}
	if _, err := v.VerifyForRefresh(tok); err != nil {
		t.Fatalf("refresh must accept an expired but valid token: %v", err)
	}
}

func TestVerifyRejectsTampering(t *testing.T) {
	s, v, now := keys(t)
	tok, _ := s.Sign(claims(*now))
	p, sig, _ := strings.Cut(tok, ".")

	other, _ := s.Sign(Claims{UserID: uuid.New(), SessionID: uuid.New(), ExpiresAt: now.Add(48 * time.Hour).Unix()})
	otherPayload, _, _ := strings.Cut(other, ".")

	rawSig, _ := b64.DecodeString(sig)
	rawSig[0] ^= 0xff
	flipped := p + "." + b64.EncodeToString(rawSig)

	_, foreignPriv, _ := ed25519.GenerateKey(rand.Reader)
	forged, _ := NewSigner(foreignPriv).Sign(claims(*now))

	for name, bad := range map[string]string{
		"empty":           "",
		"no dot":          p,
		"swapped payload": otherPayload + "." + sig,
		"flipped sig":     flipped,
		"garbage":         "!!!.???",
		"foreign key":     forged,
	} {
		if _, err := v.Verify(bad); !errors.Is(err, ErrInvalidToken) {
			t.Errorf("%s: err = %v, want ErrInvalidToken", name, err)
		}
		if _, err := v.VerifyForRefresh(bad); !errors.Is(err, ErrInvalidToken) {
			t.Errorf("%s (refresh): err = %v, want ErrInvalidToken", name, err)
		}
	}
}

func TestParseKeysRejectWrongSizes(t *testing.T) {
	if _, err := ParsePublicKey("AAAA"); err == nil {
		t.Error("short public key accepted")
	}
	if _, err := ParsePrivateKey("not base64!"); err == nil {
		t.Error("garbage private key accepted")
	}
}

func TestRequireUser(t *testing.T) {
	s, v, now := keys(t)
	c := claims(*now)
	tok, _ := s.Sign(c)

	var seen uuid.UUID
	var forwarded string
	h := v.RequireUser(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		seen, forwarded = UserID(r.Context()), Token(r.Context())
	}))

	run := func(mod func(*http.Request)) int {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		mod(req)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	if code := run(func(*http.Request) {}); code != 401 {
		t.Errorf("no token: %d", code)
	}
	if code := run(func(r *http.Request) { r.Header.Set("Authorization", "Bearer nope") }); code != 401 {
		t.Errorf("bad token: %d", code)
	}
	if code := run(func(r *http.Request) { r.AddCookie(&http.Cookie{Name: CookieName, Value: tok}) }); code != 200 || seen != c.UserID {
		t.Errorf("cookie: %d user %v", code, seen)
	}
	seen = uuid.Nil
	if code := run(func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+tok) }); code != 200 || seen != c.UserID || forwarded != tok {
		t.Errorf("bearer: %d user %v", code, seen)
	}
}

func TestCookies(t *testing.T) {
	rec := httptest.NewRecorder()
	SetCookie(rec, "tok", time.Unix(1_800_000_000, 0), true)
	ClearCookie(rec, false)
	cs := rec.Result().Cookies()
	if !cs[0].HttpOnly || !cs[0].Secure || cs[0].SameSite != http.SameSiteLaxMode || cs[0].Value != "tok" {
		t.Errorf("set cookie: %+v", cs[0])
	}
	if cs[1].MaxAge != -1 || cs[1].Value != "" {
		t.Errorf("clear cookie: %+v", cs[1])
	}
}
