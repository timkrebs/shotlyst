package ids

import (
	"errors"
	"testing"
)

func TestParse(t *testing.T) {
	good := "6f2c1d2e-1111-4a4a-8b8b-0123456789ab"
	if id, err := Parse(good); err != nil || id.String() != good {
		t.Fatalf("Parse(%q) = %v, %v", good, id, err)
	}
	for _, bad := range []string{"", "nope", "{" + good + "}", "urn:uuid:" + good, "00000000-0000-0000-0000-000000000000"} {
		if _, err := Parse(bad); !errors.Is(err, ErrInvalid) {
			t.Errorf("Parse(%q) err = %v, want ErrInvalid", bad, err)
		}
	}
	if _, err := ParseIdempotencyKey(New().String()); err != nil {
		t.Errorf("fresh id rejected: %v", err)
	}
}
