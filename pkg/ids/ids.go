// Package ids is the one place that decides how Shotlyst parses and creates
// identifiers: resource UUIDs from paths and bodies, and client-generated
// idempotency keys (offline shot creation, sync mutations).
//
// Keeping it separate means every service rejects malformed ids with the
// same error and nobody hand-rolls UUID parsing. It must stay dependency-free
// apart from google/uuid.
package ids

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
)

// ErrInvalid is returned for anything that is not a canonical UUID.
var ErrInvalid = errors.New("invalid id")

// New returns a random (v4) UUID, matching gen_random_uuid() in Postgres.
func New() uuid.UUID { return uuid.New() }

// Parse accepts only the canonical 36-character form. uuid.Parse also takes
// braces and urn: prefixes; rejecting those keeps URLs and logs uniform.
func Parse(s string) (uuid.UUID, error) {
	if len(s) != 36 {
		return uuid.Nil, fmt.Errorf("%w: %q", ErrInvalid, s)
	}
	id, err := uuid.Parse(s)
	if err != nil || id == uuid.Nil {
		return uuid.Nil, fmt.Errorf("%w: %q", ErrInvalid, s)
	}
	return id, nil
}

// ParseIdempotencyKey validates a client-generated key (sync mutation id,
// shot client_id). It is a UUID too, but named separately so call sites say
// what the value means.
func ParseIdempotencyKey(s string) (uuid.UUID, error) {
	return Parse(s)
}
