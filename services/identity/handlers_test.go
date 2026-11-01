package identity

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/timkrebs/shotlyst/pkg/app"
	"github.com/timkrebs/shotlyst/pkg/app/apptest"
	"github.com/timkrebs/shotlyst/pkg/authx"
	"github.com/timkrebs/shotlyst/pkg/dbx/dbtest"
)

func TestMain(m *testing.M) { dbtest.Main(m) }

var opts = app.Options[Config]{Name: "identity", Prefix: Prefix, Routes: Routes}

func harness(t *testing.T) *apptest.Harness {
	t.Helper()
	keys := apptest.NewKeys(t)
	pool := dbtest.Pool(t, "identity", Migrations)
	return apptest.New(t, opts, &Config{AuthPrivateKey: keys.Private}, keys, pool)
}

// sessionCookie returns the session cookie a response set ("" if none).
func sessionCookie(t *testing.T, rec *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, c := range rec.Result().Cookies() {
		if c.Name == authx.CookieName {
			return c
		}
	}
	return nil
}

func register(t *testing.T, h *apptest.Harness, email string) string {
	t.Helper()
	rec := h.Do(http.MethodPost, Prefix+"/register", map[string]string{
		"email": email, "password": "correct horse", "display_name": "Tim"}, "")
	if rec.Code != http.StatusCreated {
		t.Fatalf("register %s: %d %s", email, rec.Code, rec.Body)
	}
	c := sessionCookie(t, rec)
	if c == nil || !c.HttpOnly || c.SameSite != http.SameSiteLaxMode || c.Value == "" {
		t.Fatalf("bad session cookie: %+v", c)
	}
	return c.Value
}

func TestRoutesMatchSpec(t *testing.T) {
	harness(t).AssertRoutesMatchSpec("../../api/identity.yaml")
}

func TestRegisterAndMe(t *testing.T) {
	h := harness(t)
	tok := register(t, h, " Tim@Example.com ")

	rec := h.Do(http.MethodGet, Prefix+"/me", nil, tok)
	me := apptest.JSON(t, rec)
	if rec.Code != 200 || me["email"] != "tim@example.com" || me["display_name"] != "Tim" || me["locale"] != "en" {
		t.Fatalf("me: %d %v", rec.Code, me)
	}
	if _, leaked := me["password_hash"]; leaked {
		t.Fatal("password hash in response")
	}
	if !strings.Contains(h.Logs.String(), `"msg":"user registered"`) || !strings.Contains(h.Logs.String(), `"email":"t***@example.com"`) {
		t.Errorf("registration not logged with redacted email: %s", h.Logs)
	}
	if strings.Contains(h.Logs.String(), "tim@example.com") || strings.Contains(h.Logs.String(), "correct horse") {
		t.Error("email or password leaked into logs")
	}
}

func TestRegisterConflictAndValidation(t *testing.T) {
	h := harness(t)
	register(t, h, "a@b.de")
	rec := h.Do(http.MethodPost, Prefix+"/register", map[string]string{"email": "A@B.de", "password": "another one", "display_name": "X"}, "")
	if rec.Code != http.StatusConflict {
		t.Errorf("duplicate email: %d %s", rec.Code, rec.Body)
	}
	rec = h.Do(http.MethodPost, Prefix+"/register", map[string]string{"email": "nope", "password": "short", "display_name": ""}, "")
	if rec.Code != http.StatusUnprocessableEntity || len(apptest.JSON(t, rec)["errors"].([]any)) != 3 {
		t.Errorf("validation: %d %s", rec.Code, rec.Body)
	}
}

func TestLogin(t *testing.T) {
	h := harness(t)
	register(t, h, "a@b.de")

	for _, c := range []struct{ email, pw, reason string }{
		{"a@b.de", "wrong password", "bad_password"},
		{"ghost@b.de", "correct horse", "unknown_email"},
	} {
		rec := h.Do(http.MethodPost, Prefix+"/login", map[string]string{"email": c.email, "password": c.pw}, "")
		if rec.Code != http.StatusUnauthorized || apptest.JSON(t, rec)["detail"] != "invalid email or password" {
			t.Errorf("%s: %d %s", c.reason, rec.Code, rec.Body)
		}
		if !strings.Contains(h.Logs.String(), `"reason":"`+c.reason+`"`) {
			t.Errorf("rejection reason %s not logged", c.reason)
		}
	}

	rec := h.Do(http.MethodPost, Prefix+"/login", map[string]string{"email": " A@B.DE", "password": "correct horse"}, "")
	if rec.Code != http.StatusOK || sessionCookie(t, rec) == nil {
		t.Fatalf("login: %d %s", rec.Code, rec.Body)
	}
	if h.Do(http.MethodGet, Prefix+"/me", nil, sessionCookie(t, rec).Value).Code != 200 {
		t.Error("login token not accepted")
	}
}

func TestPatchMe(t *testing.T) {
	h := harness(t)
	tok := register(t, h, "a@b.de")
	rec := h.Do(http.MethodPatch, Prefix+"/me", map[string]string{"display_name": " Kim ", "locale": "de"}, tok)
	if me := apptest.JSON(t, rec); rec.Code != 200 || me["display_name"] != "Kim" || me["locale"] != "de" {
		t.Fatalf("patch: %d %v", rec.Code, me)
	}
	rec = h.Do(http.MethodPatch, Prefix+"/me", map[string]string{"locale": "fr"}, tok)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("bad locale: %d", rec.Code)
	}
	if h.Do(http.MethodPatch, Prefix+"/me", map[string]string{"locale": "de"}, "").Code != http.StatusUnauthorized {
		t.Error("patch without session must be 401")
	}
}

func TestRefreshRotatesAndSurvivesTokenExpiry(t *testing.T) {
	h := harness(t)
	first := register(t, h, "a@b.de")

	h.Advance(25 * time.Hour) // token (24 h) expired, session (30 d) alive
	if h.Do(http.MethodGet, Prefix+"/me", nil, first).Code != http.StatusUnauthorized {
		t.Fatal("expired token must not reach /me")
	}
	rec := h.Do(http.MethodPost, Prefix+"/refresh", nil, first)
	if rec.Code != http.StatusNoContent || sessionCookie(t, rec) == nil {
		t.Fatalf("refresh with expired token: %d %s", rec.Code, rec.Body)
	}
	second := sessionCookie(t, rec).Value
	if h.Do(http.MethodGet, Prefix+"/me", nil, second).Code != 200 {
		t.Fatal("refreshed token rejected")
	}
	// The old token was rotated out and cannot mint another one.
	if rec := h.Do(http.MethodPost, Prefix+"/refresh", nil, first); rec.Code != http.StatusUnauthorized {
		t.Errorf("replayed old token: %d", rec.Code)
	}

	h.Advance(31 * 24 * time.Hour) // session itself expired
	if rec := h.Do(http.MethodPost, Prefix+"/refresh", nil, second); rec.Code != http.StatusUnauthorized {
		t.Errorf("refresh after session expiry: %d", rec.Code)
	}
}

func TestLogoutRevokesSession(t *testing.T) {
	h := harness(t)
	tok := register(t, h, "a@b.de")

	rec := h.Do(http.MethodPost, Prefix+"/logout", nil, tok)
	if c := sessionCookie(t, rec); rec.Code != http.StatusNoContent || c == nil || c.MaxAge != -1 {
		t.Fatalf("logout: %d cookie %+v", rec.Code, c)
	}
	if h.Do(http.MethodPost, Prefix+"/refresh", nil, tok).Code != http.StatusUnauthorized {
		t.Error("refresh after logout must fail")
	}
	// ADR-3 trade-off, asserted so a change is deliberate: other endpoints
	// accept the token until it expires.
	if h.Do(http.MethodGet, Prefix+"/me", nil, tok).Code != 200 {
		t.Error("stateless token should remain valid until exp")
	}
	// Logout without any session still clears the cookie.
	if h.Do(http.MethodPost, Prefix+"/logout", nil, "").Code != http.StatusNoContent {
		t.Error("anonymous logout")
	}
}

func TestLoginIsRateLimited(t *testing.T) {
	h := harness(t)
	body := map[string]string{"email": "ghost@b.de", "password": "whatever1"}
	for i := range authBurst {
		if rec := h.Do(http.MethodPost, Prefix+"/login", body, ""); rec.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: %d", i+1, rec.Code)
		}
	}
	rec := h.Do(http.MethodPost, Prefix+"/login", body, "")
	if rec.Code != http.StatusTooManyRequests || rec.Header().Get("Retry-After") == "" {
		t.Fatalf("over the limit: %d", rec.Code)
	}
	h.Advance(time.Minute)
	if rec := h.Do(http.MethodPost, Prefix+"/login", body, ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("after refill: %d", rec.Code)
	}
}

func TestCSRFHeaderRequired(t *testing.T) {
	h := harness(t)
	rec := h.DoWith(http.MethodPost, Prefix+"/login", map[string]string{"email": "a@b.de", "password": "x"}, func(r *http.Request) {
		r.Header.Del("X-Shotlyst-Client")
	})
	if rec.Code != http.StatusForbidden {
		t.Errorf("login without CSRF header: %d", rec.Code)
	}
}

func TestMismatchedKeysFailStartup(t *testing.T) {
	keys, other := apptest.NewKeys(t), apptest.NewKeys(t)
	err := Routes(chi.NewRouter(), app.Deps[Config]{Config: &Config{AuthPrivateKey: other.Private}, Base: app.Base{AuthPublicKey: keys.Public}})
	if err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("err = %v", err)
	}
}
