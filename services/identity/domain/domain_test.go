package domain

import (
	"strings"
	"testing"
)

func TestNormalizeEmail(t *testing.T) {
	cases := []struct {
		in, want string
		ok       bool
	}{
		{"  Tim@Example.COM ", "tim@example.com", true},
		{"a@b.de", "a@b.de", true},
		{"", "", false},
		{"no-at-sign", "", false},
		{"Tim <tim@example.com>", "", false},
		{"a@b.de, c@d.de", "", false},
		{strings.Repeat("a", 250) + "@b.de", "", false},
	}
	for _, c := range cases {
		got, ok := NormalizeEmail(c.in)
		if got != c.want || ok != c.ok {
			t.Errorf("NormalizeEmail(%q) = %q, %v; want %q, %v", c.in, got, ok, c.want, c.ok)
		}
	}
}

func TestValidateRegistration(t *testing.T) {
	cases := []struct {
		name    string
		in      Registration
		invalid []string
	}{
		{"valid", Registration{" A@B.de ", "correct horse", " Tim "}, nil},
		{"all bad", Registration{"x", "short", "  "}, []string{"email", "password", "display_name"}},
		{"long password", Registration{"a@b.de", strings.Repeat("p", 129), "Tim"}, []string{"password"}},
		{"multibyte password counts runes", Registration{"a@b.de", "ääääääää", "Tim"}, nil},
		{"long name", Registration{"a@b.de", "correct horse", strings.Repeat("n", 81)}, []string{"display_name"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := c.in
			p := ValidateRegistration(&r)
			if len(p) != len(c.invalid) {
				t.Fatalf("problems %v, want fields %v", p, c.invalid)
			}
			for _, f := range c.invalid {
				if p[f] == "" {
					t.Errorf("missing problem for %s", f)
				}
			}
			if len(p) == 0 && (r.Email != "a@b.de" || r.DisplayName != "Tim") {
				t.Errorf("not normalised: %+v", r)
			}
		})
	}
}

func TestValidateProfileUpdate(t *testing.T) {
	s := func(v string) *string { return &v }
	cases := []struct {
		name    string
		in      ProfileUpdate
		invalid []string
	}{
		{"empty patch", ProfileUpdate{}, nil},
		{"valid", ProfileUpdate{DisplayName: s(" Kim "), Locale: s("de")}, nil},
		{"bad locale", ProfileUpdate{Locale: s("fr")}, []string{"locale"}},
		{"blank name", ProfileUpdate{DisplayName: s(" ")}, []string{"display_name"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			u := c.in
			p := ValidateProfileUpdate(&u)
			if len(p) != len(c.invalid) {
				t.Fatalf("problems %v, want %v", p, c.invalid)
			}
			if c.name == "valid" && *u.DisplayName != "Kim" {
				t.Errorf("name not trimmed: %q", *u.DisplayName)
			}
		})
	}
}
