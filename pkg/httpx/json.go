package httpx

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/timkrebs/shotlyst/pkg/ids"
)

// MaxBodyBytes caps JSON request bodies. Uploads go to media as multipart
// and have their own limit; nothing JSON-shaped in the API comes close.
const MaxBodyBytes = 1 << 20

// DecodeError explains why a body could not be decoded and which status
// that deserves (400 malformed, 413 too large, 415 wrong content type).
type DecodeError struct {
	Status int
	Detail string
}

func (e *DecodeError) Error() string { return e.Detail }

// DecodeJSON reads one JSON object into dst. Unknown fields are rejected so
// a typo in a client field name fails loudly instead of being ignored.
func DecodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, MaxBodyBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		var tooLarge *http.MaxBytesError
		switch {
		case errors.As(err, &tooLarge):
			return &DecodeError{Status: http.StatusRequestEntityTooLarge, Detail: "request body too large"}
		case errors.Is(err, io.EOF):
			return &DecodeError{Status: http.StatusBadRequest, Detail: "request body is empty"}
		default:
			return &DecodeError{Status: http.StatusBadRequest, Detail: fmt.Sprintf("invalid JSON: %v", err)}
		}
	}
	if dec.More() {
		return &DecodeError{Status: http.StatusBadRequest, Detail: "request body must contain a single JSON object"}
	}
	return nil
}

// ProblemFromDecode answers a DecodeJSON failure with the right status.
func ProblemFromDecode(w http.ResponseWriter, r *http.Request, err error) {
	var de *DecodeError
	if errors.As(err, &de) {
		WriteProblem(w, r, Problem{Status: de.Status, Type: "bad-request", Detail: de.Detail})
		return
	}
	ProblemBadRequest(w, r, err.Error())
}

// Encode writes v as JSON with the given status.
func Encode(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	writeJSON(w, status, v)
}

// writeJSON ignores encoding errors: the header is already sent, and the
// only realistic failure is a client that went away.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// PathUUID parses the named chi path parameter as a resource id.
func PathUUID(r *http.Request, name string) (uuid.UUID, error) {
	return ids.Parse(chi.URLParam(r, name))
}
