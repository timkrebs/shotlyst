package httpx

import (
	"errors"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/timkrebs/shotlyst/pkg/dbx"
	"github.com/timkrebs/shotlyst/pkg/logx"
)

// Problem is an RFC 7807 problem+json body. Type is a short slug (for
// example "not-found"); it is rendered as the relative URI /problems/<slug>
// and logged as problem_type so Loki can group failures by kind.
type Problem struct {
	Type   string       `json:"-"`
	Title  string       `json:"title"`
	Status int          `json:"status"`
	Detail string       `json:"detail,omitempty"`
	Errors []FieldError `json:"errors,omitempty"`
}

// FieldError points a 422 at one input field, so the SPA can show the
// message next to it.
type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// WriteProblem writes p as application/problem+json and annotates the
// request log line. It is the only place error bodies are produced.
func WriteProblem(w http.ResponseWriter, r *http.Request, p Problem) {
	if p.Title == "" {
		p.Title = http.StatusText(p.Status)
	}
	if p.Type == "" {
		p.Type = "about-blank"
	}
	logx.SetProblem(r.Context(), p.Type)
	body := struct {
		Type string `json:"type"`
		Problem
	}{Type: "/problems/" + p.Type, Problem: p}
	w.Header().Set("Content-Type", "application/problem+json")
	writeJSON(w, p.Status, body)
}

// ProblemBadRequest is for malformed input that is not a field validation
// failure (bad path id, unparsable query).
func ProblemBadRequest(w http.ResponseWriter, r *http.Request, detail string) {
	WriteProblem(w, r, Problem{Status: http.StatusBadRequest, Type: "bad-request", Detail: detail})
}

// ProblemUnauthorized is for missing, invalid or expired sessions.
func ProblemUnauthorized(w http.ResponseWriter, r *http.Request, detail string) {
	WriteProblem(w, r, Problem{Status: http.StatusUnauthorized, Type: "unauthorized", Detail: detail})
}

// ProblemNotFound is also the answer for other users' resources (never 403).
func ProblemNotFound(w http.ResponseWriter, r *http.Request) {
	WriteProblem(w, r, Problem{Status: http.StatusNotFound, Type: "not-found"})
}

// ProblemConflict is for uniqueness and state conflicts (409).
func ProblemConflict(w http.ResponseWriter, r *http.Request, detail string) {
	WriteProblem(w, r, Problem{Status: http.StatusConflict, Type: "conflict", Detail: detail})
}

// ProblemUnprocessable reports a single invalid field (422).
func ProblemUnprocessable(w http.ResponseWriter, r *http.Request, field, message string) {
	ProblemValidation(w, r, []FieldError{{Field: field, Message: message}})
}

// ProblemValidation reports every invalid field at once (422).
func ProblemValidation(w http.ResponseWriter, r *http.Request, errs []FieldError) {
	WriteProblem(w, r, Problem{Status: http.StatusUnprocessableEntity, Type: "validation",
		Detail: "request validation failed", Errors: errs})
}

// ProblemFields reports a field → message map (as returned by domain
// validators) as a 422, sorted by field so responses are deterministic.
func ProblemFields(w http.ResponseWriter, r *http.Request, problems map[string]string) {
	fields := make([]string, 0, len(problems))
	for f := range problems {
		fields = append(fields, f)
	}
	sort.Strings(fields)
	errs := make([]FieldError, len(fields))
	for i, f := range fields {
		errs[i] = FieldError{Field: f, Message: problems[f]}
	}
	ProblemValidation(w, r, errs)
}

// ProblemTooManyRequests tells the client when to retry (429).
func ProblemTooManyRequests(w http.ResponseWriter, r *http.Request, retryAfter time.Duration) {
	w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds()+0.999)))
	WriteProblem(w, r, Problem{Status: http.StatusTooManyRequests, Type: "rate-limited"})
}

// ProblemInternal answers 500 with a generic body and hands err to logx,
// which logs it with a stack on the request line. Internal details never
// reach the client.
func ProblemInternal(w http.ResponseWriter, r *http.Request, err error) {
	logx.SetError(r.Context(), err)
	WriteProblem(w, r, Problem{Status: http.StatusInternalServerError, Type: "internal"})
}

// ProblemFromStore maps dbx sentinels to statuses: ErrNotFound → 404,
// ErrConflict → 409, anything else → 500.
func ProblemFromStore(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, dbx.ErrNotFound):
		ProblemNotFound(w, r)
	case errors.Is(err, dbx.ErrConflict):
		ProblemConflict(w, r, "")
	default:
		ProblemInternal(w, r, err)
	}
}
