// Package clientx is the only way a Shotlyst service calls another one.
//
// It fixes the calling convention once (docs/02 §4): JSON over plain HTTP,
// short timeouts, two retries with backoff for idempotent methods only,
// the caller's session token forwarded as a Bearer header (no service
// accounts, no internal bypass), the request id propagated, and one
// "outbound call" log line plus an outbound_requests_total sample per
// attempt. Typed clients (gear, sun, media, planning) are added next to this
// file as services need them. It also provides the small TTL cache those
// clients use for degraded-mode reads.
package clientx

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/timkrebs/shotlyst/pkg/authx"
	"github.com/timkrebs/shotlyst/pkg/httpx"
	"github.com/timkrebs/shotlyst/pkg/logx"
	"github.com/timkrebs/shotlyst/pkg/metrics"
)

// ErrUnavailable marks failures where the dependency could not answer
// (transport error, timeout, 5xx). Callers degrade on it — derived values
// become null with a warning — instead of failing their own request.
var ErrUnavailable = errors.New("dependency unavailable")

// StatusError is a non-2xx answer. 5xx statuses also match ErrUnavailable.
type StatusError struct {
	Target string
	Status int
}

func (e *StatusError) Error() string {
	return fmt.Sprintf("%s answered %d", e.Target, e.Status)
}

// Is lets errors.Is(err, ErrUnavailable) cover 5xx answers.
func (e *StatusError) Is(target error) bool {
	return target == ErrUnavailable && e.Status >= 500
}

// Options tunes a Client; zero values give the documented defaults.
type Options struct {
	Timeout   time.Duration     // per attempt; default 2s
	Retries   int               // extra attempts for GET/HEAD; default 2
	Backoff   time.Duration     // first retry delay, doubled each time; default 100ms
	Metrics   *metrics.Registry // optional
	Transport http.RoundTripper // optional, for tests
}

// Client calls one target service at baseURL (e.g. http://shotlyst-gear:8080).
type Client struct {
	target  string
	base    string
	http    *http.Client
	retries int
	backoff time.Duration
	metrics *metrics.Registry
}

// New builds a client for target (the service name used in logs/metrics).
func New(target, baseURL string, o Options) *Client {
	if o.Timeout == 0 {
		o.Timeout = 2 * time.Second
	}
	if o.Retries == 0 {
		o.Retries = 2
	}
	if o.Backoff == 0 {
		o.Backoff = 100 * time.Millisecond
	}
	return &Client{
		target:  target,
		base:    strings.TrimRight(baseURL, "/"),
		http:    &http.Client{Timeout: o.Timeout, Transport: o.Transport},
		retries: o.Retries,
		backoff: o.Backoff,
		metrics: o.Metrics,
	}
}

// Do sends body (if non-nil) as JSON and decodes a 2xx JSON answer into
// out (if non-nil). Non-idempotent methods are attempted exactly once:
// retrying a POST could apply it twice.
func (c *Client) Do(ctx context.Context, method, path string, body, out any) error {
	var payload []byte
	if body != nil {
		var err error
		if payload, err = json.Marshal(body); err != nil {
			return fmt.Errorf("encode %s request: %w", c.target, err)
		}
	}
	attempts := 1
	if method == http.MethodGet || method == http.MethodHead {
		attempts += c.retries
	}

	var err error
	for attempt := 1; attempt <= attempts; attempt++ {
		if attempt > 1 {
			select {
			case <-ctx.Done():
				return fmt.Errorf("%w: %s: %w", ErrUnavailable, c.target, ctx.Err())
			case <-time.After(c.backoff << (attempt - 2)):
			}
		}
		err = c.attempt(ctx, method, path, payload, out, attempt, attempt == attempts)
		if err == nil || !errors.Is(err, ErrUnavailable) {
			return err
		}
	}
	return err
}

// attempt performs one HTTP exchange and logs it. Retryable failures log at
// WARN as "outbound call"; the final failure logs "dependency unavailable"
// at WARN too, because the caller degrades gracefully — the dependency's
// own pod is where an ERROR belongs (docs/08 §6).
func (c *Client) attempt(ctx context.Context, method, path string, payload []byte, out any, attempt int, last bool) error {
	start := time.Now()
	status, err := c.exchange(ctx, method, path, payload, out)
	if c.metrics != nil {
		c.metrics.ObserveOutbound(c.target, status)
	}
	attrs := []any{"target_service", c.target, "method", method, "path", path,
		"status", status, "duration_ms", logx.Since(start), "attempt", attempt}
	l := logx.From(ctx)
	switch {
	case err == nil || !errors.Is(err, ErrUnavailable):
		l.Info("outbound call", attrs...)
	case last:
		l.Warn("dependency unavailable", append(attrs, "dependency", c.target, "error", err.Error())...)
	default:
		l.Warn("outbound call", append(attrs, "error", err.Error())...)
	}
	return err
}

func (c *Client) exchange(ctx context.Context, method, path string, payload []byte, out any) (int, error) {
	var rd io.Reader
	if payload != nil {
		rd = bytes.NewReader(payload)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, rd)
	if err != nil {
		return 0, fmt.Errorf("build %s request: %w", c.target, err)
	}
	req.Header.Set("Accept", "application/json")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if id := logx.RequestID(ctx); id != "" {
		req.Header.Set(logx.HeaderRequestID, id)
	}
	if tok := authx.Token(ctx); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	req.Header.Set(httpx.HeaderClient, "web") // writes pass the callee's CSRF check

	resp, err := c.http.Do(req)
	if err != nil {
		return 0, fmt.Errorf("%w: %s: %w", ErrUnavailable, c.target, err)
	}
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body) // drain so the connection is reused
		_ = resp.Body.Close()
	}()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return resp.StatusCode, &StatusError{Target: c.target, Status: resp.StatusCode}
	}
	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return resp.StatusCode, fmt.Errorf("decode %s response: %w", c.target, err)
		}
	}
	return resp.StatusCode, nil
}
