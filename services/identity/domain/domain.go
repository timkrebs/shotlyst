// Package domain holds identity's input rules: how emails are normalised
// and which passwords, display names and locales are acceptable.
//
// It is pure (no I/O, no clock) so the rules are table-tested in isolation
// and the handlers only translate its verdicts into HTTP. Password hashing
// is not here because it needs randomness; see ../password.go.
package domain

import (
	"net/mail"
	"strings"
	"unicode/utf8"
)

// Limits for account fields.
// TODO(spec): the PRD does not set a password policy; 8–128 follows NIST
// SP 800-63B (length over composition rules). The upper bound caps hashing
// work per request.
const (
	MinPasswordLen    = 8
	MaxPasswordLen    = 128
	MaxDisplayNameLen = 80
	maxEmailLen       = 254
)

// Locales the UI ships (NFR-8: English now, German second).
var Locales = map[string]bool{"en": true, "de": true}

// Problems maps a field name to a user-facing message. Empty means valid.
type Problems map[string]string

// NormalizeEmail trims and lowercases an address and checks it is a bare
// addr-spec (no display name). Emails are compared lowercased everywhere,
// which is why the column has a lower() check instead of citext.
func NormalizeEmail(raw string) (string, bool) {
	e := strings.ToLower(strings.TrimSpace(raw))
	if e == "" || len(e) > maxEmailLen {
		return "", false
	}
	a, err := mail.ParseAddress(e)
	if err != nil || a.Address != e || a.Name != "" {
		return "", false
	}
	return e, true
}

// Registration is the validated input of POST /register.
type Registration struct {
	Email       string
	Password    string
	DisplayName string
}

// ValidateRegistration normalises r in place and reports every invalid
// field at once.
func ValidateRegistration(r *Registration) Problems {
	p := Problems{}
	if e, ok := NormalizeEmail(r.Email); ok {
		r.Email = e
	} else {
		p["email"] = "must be a valid email address"
	}
	if msg := checkPassword(r.Password); msg != "" {
		p["password"] = msg
	}
	if name, msg := normalizeDisplayName(r.DisplayName); msg != "" {
		p["display_name"] = msg
	} else {
		r.DisplayName = name
	}
	return p
}

// ProfileUpdate is the input of PATCH /me; nil fields stay unchanged.
type ProfileUpdate struct {
	DisplayName *string
	Locale      *string
}

// ValidateProfileUpdate normalises u in place and reports invalid fields.
func ValidateProfileUpdate(u *ProfileUpdate) Problems {
	p := Problems{}
	if u.DisplayName != nil {
		if name, msg := normalizeDisplayName(*u.DisplayName); msg != "" {
			p["display_name"] = msg
		} else {
			u.DisplayName = &name
		}
	}
	if u.Locale != nil && !Locales[*u.Locale] {
		p["locale"] = "must be one of: en, de"
	}
	return p
}

func checkPassword(pw string) string {
	n := utf8.RuneCountInString(pw)
	if n < MinPasswordLen || n > MaxPasswordLen {
		return "must be 8 to 128 characters"
	}
	return ""
}

func normalizeDisplayName(raw string) (string, string) {
	name := strings.TrimSpace(raw)
	if name == "" || utf8.RuneCountInString(name) > MaxDisplayNameLen {
		return "", "must be 1 to 80 characters"
	}
	return name, ""
}
