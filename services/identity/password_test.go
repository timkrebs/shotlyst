package identity

import (
	"context"
	"crypto/rand"
	"errors"
	"strings"
	"testing"
)

func TestHasher(t *testing.T) {
	ctx := context.Background()
	h := newHasher(rand.Reader)
	enc, err := h.Hash(ctx, "correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(enc, "$argon2id$v=19$m=19456,t=2,p=1$") {
		t.Errorf("unexpected encoding %q", enc)
	}
	if again, _ := h.Hash(ctx, "correct horse"); again == enc {
		t.Error("salt not random")
	}
	for pw, want := range map[string]bool{"correct horse": true, "correct horse ": false, "": false} {
		if ok, err := h.Verify(ctx, enc, pw); err != nil || ok != want {
			t.Errorf("Verify(%q) = %v, %v", pw, ok, err)
		}
	}
	for _, bad := range []string{"", "plain", "$argon2i$v=19$m=1,t=1,p=1$c2FsdA$a2V5", "$argon2id$v=19$m=x$c2FsdA$a2V5", "$argon2id$v=19$m=8,t=1,p=1$!!$a2V5"} {
		if _, err := h.Verify(ctx, bad, "x"); !errors.Is(err, errBadHash) {
			t.Errorf("Verify(%q) err = %v", bad, err)
		}
	}
}

func TestHasherRespectsContextWhenSaturated(t *testing.T) {
	h := newHasher(rand.Reader)
	for range maxConcurrentHashes {
		h.sem <- struct{}{} // occupy every slot
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := h.Hash(ctx, "x"); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v", err)
	}
}
