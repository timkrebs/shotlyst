package identity

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/timkrebs/shotlyst/pkg/authx"
	"github.com/timkrebs/shotlyst/pkg/dbx"
	"github.com/timkrebs/shotlyst/pkg/httpx"
	"github.com/timkrebs/shotlyst/pkg/ids"
	"github.com/timkrebs/shotlyst/pkg/logx"
	"github.com/timkrebs/shotlyst/services/identity/domain"
	"github.com/timkrebs/shotlyst/services/identity/store"
)

type handlers struct {
	store    *store.Store
	signer   *authx.Signer
	verifier *authx.Verifier
	hasher   *hasher
	now      func() time.Time
	secure   bool

	dummyOnce sync.Once
	dummyHash string
}

// userResponse is the public view of a user; it never includes the hash.
type userResponse struct {
	ID          uuid.UUID `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	Locale      string    `json:"locale"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func toResponse(u store.User) userResponse {
	return userResponse{ID: u.ID, Email: u.Email, DisplayName: u.DisplayName, Locale: u.Locale, UpdatedAt: u.UpdatedAt.UTC()}
}

// register handles POST /register: validate, hash, create user and first
// session in one transaction, set the cookie, 201 with the user.
func (h *handlers) register(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req struct {
		Email       string `json:"email"`
		Password    string `json:"password"`
		DisplayName string `json:"display_name"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.ProblemFromDecode(w, r, err)
		return
	}
	reg := domain.Registration{Email: req.Email, Password: req.Password, DisplayName: req.DisplayName}
	if p := domain.ValidateRegistration(&reg); len(p) > 0 {
		httpx.ProblemFields(w, r, p)
		return
	}
	hash, err := h.hasher.Hash(ctx, reg.Password)
	if err != nil {
		httpx.ProblemInternal(w, r, fmt.Errorf("hash password: %w", err))
		return
	}

	userID := ids.New()
	tok, sess, err := h.newSession(userID)
	if err != nil {
		httpx.ProblemInternal(w, r, err)
		return
	}
	user, err := h.store.CreateUserWithSession(ctx, store.CreateUserParams{
		ID: userID, Email: reg.Email, PasswordHash: hash, DisplayName: reg.DisplayName, Locale: "en",
	}, sess)
	if errors.Is(err, dbx.ErrConflict) {
		httpx.ProblemConflict(w, r, "email is already registered")
		return
	}
	if err != nil {
		httpx.ProblemInternal(w, r, fmt.Errorf("register: %w", err))
		return
	}

	ctx = logx.SetUser(ctx, user.ID.String())
	logx.From(ctx).Info("user registered", "email", logx.Redact(user.Email))
	authx.SetCookie(w, tok, sess.ExpiresAt, h.secure)
	httpx.Encode(w, http.StatusCreated, toResponse(user))
}

// login handles POST /login. Unknown email and wrong password produce the
// same 401 after the same amount of hashing work, so responses do not
// reveal which emails have accounts.
func (h *handlers) login(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.ProblemFromDecode(w, r, err)
		return
	}
	email, _ := domain.NormalizeEmail(req.Email)

	user, err := h.store.GetUserByEmail(ctx, email)
	if err != nil && !errors.Is(dbx.MapErr(err), dbx.ErrNotFound) {
		httpx.ProblemInternal(w, r, fmt.Errorf("login lookup: %w", err))
		return
	}
	known := err == nil
	encoded := user.PasswordHash
	if !known {
		encoded = h.dummy(r)
	}
	ok, err := h.hasher.Verify(ctx, encoded, req.Password)
	if err != nil {
		httpx.ProblemInternal(w, r, fmt.Errorf("verify password for user %s: %w", user.ID, err))
		return
	}
	if !known || !ok {
		reason := "bad_password"
		if !known {
			reason = "unknown_email"
		}
		logx.From(ctx).Warn("login rejected", "reason", reason, "email", logx.Redact(email))
		httpx.ProblemUnauthorized(w, r, "invalid email or password")
		return
	}

	ctx = logx.SetUser(ctx, user.ID.String())
	// Housekeeping: drop this user's dead sessions so the table stays small
	// without a background job. A failure here must not block the login.
	if _, err := h.store.DeleteExpiredSessions(ctx, store.DeleteExpiredSessionsParams{UserID: user.ID, ExpiresAt: h.now()}); err != nil {
		logx.From(ctx).Warn("expired session cleanup failed", "error", err.Error())
	}
	tok, sess, err := h.newSession(user.ID)
	if err == nil {
		err = h.store.CreateSession(ctx, sess)
	}
	if err != nil {
		httpx.ProblemInternal(w, r, fmt.Errorf("create session for user %s: %w", user.ID, err))
		return
	}
	authx.SetCookie(w, tok, sess.ExpiresAt, h.secure)
	httpx.Encode(w, http.StatusOK, toResponse(user))
}

// refresh handles POST /refresh: exchange the current token (even if
// expired) for a new one while its session is live. The session row must
// still hold this exact token's hash, so a token that was already rotated
// out, or a logged-out session, cannot be refreshed.
func (h *handlers) refresh(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	old := authx.TokenFromRequest(r)
	claims, err := h.verifier.VerifyForRefresh(old)
	if err != nil {
		httpx.ProblemUnauthorized(w, r, "no valid session")
		return
	}
	ctx = logx.SetUser(ctx, claims.UserID.String())

	now := h.now()
	sessExp := now.Add(sessionTTL)
	tok, err := h.sign(claims.UserID, claims.SessionID, now)
	if err != nil {
		httpx.ProblemInternal(w, r, err)
		return
	}
	n, err := h.store.RotateSession(ctx, store.RotateSessionParams{
		NewHash: tokenHash(tok), ExpiresAt: sessExp, Now: now,
		ID: claims.SessionID, UserID: claims.UserID, OldHash: tokenHash(old),
	})
	if err != nil {
		httpx.ProblemInternal(w, r, fmt.Errorf("rotate session %s: %w", claims.SessionID, err))
		return
	}
	if n == 0 {
		authx.ClearCookie(w, h.secure)
		httpx.ProblemUnauthorized(w, r, "session expired or revoked")
		return
	}
	authx.SetCookie(w, tok, sessExp, h.secure)
	w.WriteHeader(http.StatusNoContent)
}

// logout handles POST /logout: delete the session if the token identifies
// one, and always clear the cookie. Other services keep accepting the
// token until it expires (≤ 24 h) — the documented ADR-3 trade-off.
func (h *handlers) logout(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if claims, err := h.verifier.VerifyForRefresh(authx.TokenFromRequest(r)); err == nil {
		ctx = logx.SetUser(ctx, claims.UserID.String())
		if err := h.store.DeleteSession(ctx, store.DeleteSessionParams{ID: claims.SessionID, UserID: claims.UserID}); err != nil {
			httpx.ProblemInternal(w, r, fmt.Errorf("delete session %s: %w", claims.SessionID, err))
			return
		}
	}
	authx.ClearCookie(w, h.secure)
	w.WriteHeader(http.StatusNoContent)
}

// getMe handles GET /me.
func (h *handlers) getMe(w http.ResponseWriter, r *http.Request) {
	user, err := h.store.GetUser(r.Context(), authx.UserID(r.Context()))
	if err != nil {
		h.userProblem(w, r, err)
		return
	}
	httpx.Encode(w, http.StatusOK, toResponse(user))
}

// patchMe handles PATCH /me {display_name?, locale?}.
func (h *handlers) patchMe(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DisplayName *string `json:"display_name"`
		Locale      *string `json:"locale"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.ProblemFromDecode(w, r, err)
		return
	}
	upd := domain.ProfileUpdate{DisplayName: req.DisplayName, Locale: req.Locale}
	if p := domain.ValidateProfileUpdate(&upd); len(p) > 0 {
		httpx.ProblemFields(w, r, p)
		return
	}
	user, err := h.store.UpdateUser(r.Context(), store.UpdateUserParams{
		ID: authx.UserID(r.Context()), DisplayName: upd.DisplayName, Locale: upd.Locale,
	})
	if err != nil {
		h.userProblem(w, r, err)
		return
	}
	httpx.Encode(w, http.StatusOK, toResponse(user))
}

// userProblem maps a failed lookup of the session's own user: a valid token
// for a deleted account is an authentication problem (401), not a 404.
func (h *handlers) userProblem(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(dbx.MapErr(err), dbx.ErrNotFound) {
		httpx.ProblemUnauthorized(w, r, "account no longer exists")
		return
	}
	httpx.ProblemInternal(w, r, fmt.Errorf("load user %s: %w", authx.UserID(r.Context()), err))
}

// newSession signs a token for a fresh session and returns the row to
// insert alongside it.
func (h *handlers) newSession(userID uuid.UUID) (string, store.CreateSessionParams, error) {
	now := h.now()
	sid := ids.New()
	tok, err := h.sign(userID, sid, now)
	if err != nil {
		return "", store.CreateSessionParams{}, err
	}
	return tok, store.CreateSessionParams{
		ID: sid, UserID: userID, TokenHash: tokenHash(tok), ExpiresAt: now.Add(sessionTTL), LastSeenAt: now,
	}, nil
}

func (h *handlers) sign(userID, sessionID uuid.UUID, now time.Time) (string, error) {
	tok, err := h.signer.Sign(authx.Claims{UserID: userID, SessionID: sessionID, ExpiresAt: now.Add(tokenTTL).Unix()})
	if err != nil {
		return "", fmt.Errorf("sign session token: %w", err)
	}
	return tok, nil
}

// dummy returns a real argon2id hash of a random password, computed once,
// so a login for an unknown email costs the same as one for a known email.
func (h *handlers) dummy(r *http.Request) string {
	h.dummyOnce.Do(func() {
		h.dummyHash, _ = h.hasher.Hash(r.Context(), ids.New().String())
	})
	return h.dummyHash
}

// tokenHash is what sessions.token_hash stores: the token itself never
// touches the database.
func tokenHash(tok string) []byte {
	s := sha256.Sum256([]byte(tok))
	return s[:]
}
