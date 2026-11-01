package httpx

import (
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"github.com/timkrebs/shotlyst/pkg/logx"
)

// RateLimiter is an in-memory token bucket per client IP. It protects
// login/register (NFR-6) and later public share-link comments. In-memory is
// deliberate: each service runs one replica on one node, so a shared store
// would add a component for no benefit (revisit if replicas > 1).
type RateLimiter struct {
	perSec float64
	burst  int
	now    func() time.Time

	mu      sync.Mutex
	buckets map[string]*bucket
	swept   time.Time
}

type bucket struct {
	lim  *rate.Limiter
	seen time.Time
}

// NewRateLimiter allows perMinute sustained requests with bursts of burst.
// now is injectable for tests; pass time.Now in production.
func NewRateLimiter(perMinute float64, burst int, now func() time.Time) *RateLimiter {
	return &RateLimiter{perSec: perMinute / 60, burst: burst, now: now, buckets: map[string]*bucket{}, swept: now()}
}

// Middleware answers 429 with Retry-After once a client's bucket is empty.
func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if wait := rl.reserve(logx.ClientIP(r)); wait > 0 {
			ProblemTooManyRequests(w, r, wait)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// reserve takes a token and returns 0, or how long until one is available.
func (rl *RateLimiter) reserve(key string) time.Duration {
	now := rl.now()
	rl.mu.Lock()
	defer rl.mu.Unlock()
	rl.sweep(now)
	b, ok := rl.buckets[key]
	if !ok {
		b = &bucket{lim: rate.NewLimiter(rate.Limit(rl.perSec), rl.burst)}
		rl.buckets[key] = b
	}
	b.seen = now
	res := b.lim.ReserveN(now, 1)
	if d := res.DelayFrom(now); d > 0 {
		res.CancelAt(now)
		return d
	}
	return 0
}

// sweep drops buckets idle for ten minutes (by then they are full again),
// bounding memory without a background goroutine.
func (rl *RateLimiter) sweep(now time.Time) {
	if now.Sub(rl.swept) < time.Minute {
		return
	}
	for k, b := range rl.buckets {
		if now.Sub(b.seen) > 10*time.Minute {
			delete(rl.buckets, k)
		}
	}
	rl.swept = now
}
