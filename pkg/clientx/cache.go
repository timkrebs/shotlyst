package clientx

import (
	"sync"
	"time"
)

// Cache is a small in-process TTL cache with a size cap. Typed clients use
// it for data that changes rarely (camera crop factors: 60 s) and the sun
// service for computed times (1 h), so a dependency blip or a hot snapshot
// does not turn into one outbound call per request. Eviction is a linear
// scan, which is fine for the few hundred entries a homelab sees.
type Cache[K comparable, V any] struct {
	ttl time.Duration
	max int
	now func() time.Time

	mu    sync.Mutex
	items map[K]cacheEntry[V]
}

type cacheEntry[V any] struct {
	val     V
	expires time.Time
	added   time.Time
}

// NewCache returns a cache holding at most max entries for ttl each.
// now is injectable for tests; pass time.Now in production.
func NewCache[K comparable, V any](ttl time.Duration, max int, now func() time.Time) *Cache[K, V] {
	return &Cache[K, V]{ttl: ttl, max: max, now: now, items: make(map[K]cacheEntry[V])}
}

// Get returns a fresh value; expired entries count as missing.
func (c *Cache[K, V]) Get(k K) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.items[k]
	if !ok || !c.now().Before(e.expires) {
		var zero V
		return zero, false
	}
	return e.val, true
}

// Set stores v, evicting expired entries and then the oldest one when full.
func (c *Cache[K, V]) Set(k K, v V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	if _, exists := c.items[k]; !exists && len(c.items) >= c.max {
		c.evict(now)
	}
	c.items[k] = cacheEntry[V]{val: v, expires: now.Add(c.ttl), added: now}
}

func (c *Cache[K, V]) evict(now time.Time) {
	var oldestKey K
	var oldest time.Time
	first := true
	for k, e := range c.items {
		if !now.Before(e.expires) {
			delete(c.items, k)
			continue
		}
		if first || e.added.Before(oldest) {
			oldestKey, oldest, first = k, e.added, false
		}
	}
	if len(c.items) >= c.max && !first {
		delete(c.items, oldestKey)
	}
}
