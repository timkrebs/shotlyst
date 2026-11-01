package config

import (
	"strings"
	"testing"
	"time"
)

type nested struct {
	Level string `env:"LOG_LEVEL" default:"info"`
}

type sample struct {
	Addr    string        `env:"ADDR" default:":8080"`
	DB      string        `env:"DATABASE_URL" required:"true" secret:"true"`
	Auto    bool          `env:"AUTO_MIGRATE" default:"false"`
	Workers int           `env:"WORKERS" default:"2"`
	Ratio   float64       `env:"RATIO" default:"1.5"`
	Timeout time.Duration `env:"TIMEOUT" default:"5s"`
	Pod     string        `env:"POD_NAME,noprefix"`
	Key     string        `env:"KEY" secret:"true"`
	Log     nested
}

func env(m map[string]string) Lookup {
	return func(k string) (string, bool) { v, ok := m[k]; return v, ok }
}

func TestLoadDefaultsAndOverrides(t *testing.T) {
	var c sample
	err := LoadFrom(env(map[string]string{
		"X_DATABASE_URL": "postgres://u:p@h/db",
		"X_AUTO_MIGRATE": "true",
		"X_TIMEOUT":      "2m",
		"POD_NAME":       "sun-abc",
		"X_LOG_LEVEL":    "debug",
	}), "X_", &c)
	if err != nil {
		t.Fatal(err)
	}
	want := sample{Addr: ":8080", DB: "postgres://u:p@h/db", Auto: true, Workers: 2, Ratio: 1.5,
		Timeout: 2 * time.Minute, Pod: "sun-abc", Log: nested{Level: "debug"}}
	if c != want {
		t.Fatalf("got %+v\nwant %+v", c, want)
	}
}

func TestLoadReportsAllProblems(t *testing.T) {
	var c sample
	err := LoadFrom(env(map[string]string{"X_WORKERS": "many"}), "X_", &c)
	if err == nil {
		t.Fatal("expected error")
	}
	for _, want := range []string{"X_DATABASE_URL is required", "X_WORKERS"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q does not mention %q", err, want)
		}
	}
}

func TestLoadRejectsNonStruct(t *testing.T) {
	var s string
	if err := LoadFrom(env(nil), "", &s); err == nil {
		t.Fatal("expected error for non-struct dst")
	}
}

func TestRedactedHidesSecretsButShowsUnset(t *testing.T) {
	c := sample{DB: "postgres://u:secret@h/db", Pod: "p"}
	got := Redacted("X_", &c)
	if got["X_DATABASE_URL"] != Redaction {
		t.Errorf("secret not redacted: %q", got["X_DATABASE_URL"])
	}
	if got["X_KEY"] != "" {
		t.Errorf("unset secret should render empty, got %q", got["X_KEY"])
	}
	if got["POD_NAME"] != "p" || got["X_LOG_LEVEL"] != "" {
		t.Errorf("unexpected map %v", got)
	}
	if s := String("X_", &c); strings.Contains(s, "secret") || !strings.Contains(s, "X_DATABASE_URL=***") {
		t.Errorf("String leaked or missed secret: %s", s)
	}
}
