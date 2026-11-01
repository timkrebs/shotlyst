package identity

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Argon2id parameters: the OWASP minimum (19 MiB, 2 passes, 1 lane). Each
// hash allocates m KiB, so with a 128 Mi pod limit the hasher also caps
// concurrency (maxConcurrentHashes); a login burst queues instead of
// OOM-killing the pod. Parameters are stored in every hash, so raising them
// later only affects new hashes.
const (
	argonMemoryKiB      = 19 * 1024
	argonTime           = 2
	argonThreads        = 1
	argonKeyLen         = 32
	argonSaltLen        = 16
	maxConcurrentHashes = 2
)

var errBadHash = errors.New("malformed password hash")

// hasher hashes and verifies passwords with bounded concurrency.
type hasher struct {
	sem  chan struct{}
	rand io.Reader
}

func newHasher(rand io.Reader) *hasher {
	return &hasher{sem: make(chan struct{}, maxConcurrentHashes), rand: rand}
}

// Hash returns a PHC-format string: $argon2id$v=19$m=…,t=…,p=…$salt$key.
func (h *hasher) Hash(ctx context.Context, password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := io.ReadFull(h.rand, salt); err != nil {
		return "", fmt.Errorf("read salt: %w", err)
	}
	if err := h.acquire(ctx); err != nil {
		return "", err
	}
	defer h.release()
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemoryKiB, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version, argonMemoryKiB, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}

// Verify reports whether password matches encoded, in constant time.
func (h *hasher) Verify(ctx context.Context, encoded, password string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, errBadHash
	}
	var version int
	var mem, iters uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false, errBadHash
	}
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &mem, &iters, &threads); err != nil {
		return false, errBadHash
	}
	salt, err1 := base64.RawStdEncoding.DecodeString(parts[4])
	want, err2 := base64.RawStdEncoding.DecodeString(parts[5])
	if err1 != nil || err2 != nil || len(want) == 0 {
		return false, errBadHash
	}
	if err := h.acquire(ctx); err != nil {
		return false, err
	}
	defer h.release()
	got := argon2.IDKey([]byte(password), salt, iters, mem, threads, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

func (h *hasher) acquire(ctx context.Context) error {
	select {
	case h.sem <- struct{}{}:
		return nil
	case <-ctx.Done():
		return fmt.Errorf("wait for password hasher: %w", ctx.Err())
	}
}

func (h *hasher) release() { <-h.sem }
