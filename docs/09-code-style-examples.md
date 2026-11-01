# Shotlyst — Code Style Examples

Reference snippets showing the expected shape and comment density. Claude
Code should mirror these; they are not complete implementations.

## 1. A service `main.go` (the whole file)

```go
// Command planning runs the planning service: projects, beats, shots,
// shoot days, idea cards and offline sync. All wiring lives in pkg/app so
// this file stays a one-liner; see docs/02-architecture.md §3.
package main

import (
	"github.com/timkrebs/shotlyst/pkg/app"
	"github.com/timkrebs/shotlyst/services/planning"
)

// version is injected at build time via -ldflags "-X main.version=…".
var version = "dev"

func main() {
	app.Run(app.Options[planning.Config]{
		Name:       "planning",
		Version:    version,
		Prefix:     planning.Prefix,       // "/api/v1/plan"; routes are mounted under it
		Schema:     "planning",            // Postgres schema this service owns
		Migrations: planning.Migrations,   // embedded goose files
		Routes:     planning.Routes,       // func(r chi.Router, d app.Deps[planning.Config]) error
	})
}
```

## 2. Package comment (`services/planning/doc.go`)

```go
// Package planning is the core bounded context of Shotlyst: projects,
// beats, shots, shoot days, idea cards and the offline sync protocol.
//
// It owns the Postgres schema "planning" and must not read other schemas.
// Data from other services (camera crop factors, lens image circles, sun
// times, media URLs) is fetched through pkg/clientx and cached briefly;
// when a dependency is unavailable the service degrades (derived values
// become null with a warning) instead of failing the request.
//
// Layout:
//   - handlers_*.go  HTTP layer, thin, maps to store/domain
//   - domain/        pure business rules, no I/O
//   - store/         sqlc-generated queries + small hand-written helpers
//   - migrations/    goose SQL, embedded via Migrations
package planning
```

## 3. A pure domain function with a "why" comment

```go
// Renumber returns new gap-based positions for ids in the given order.
//
// Positions are spaced by Gap (1000) so a single insert between two items
// can later reuse the midpoint without renumbering. Callers pass the full
// desired order of a container (all shots of a beat); partial orders are
// rejected because they would silently drop items.
func Renumber(ids []uuid.UUID) (map[uuid.UUID]int, error) {
	if len(ids) == 0 {
		return nil, ErrEmptyOrder
	}
	out := make(map[uuid.UUID]int, len(ids))
	for i, id := range ids {
		if _, dup := out[id]; dup {
			return nil, fmt.Errorf("%w: %s", ErrDuplicateID, id)
		}
		out[id] = (i + 1) * Gap
	}
	return out, nil
}
```

## 4. A handler (thin, logs at the edge)

```go
// reorderShots handles PUT /beats/{id}/shots/order. It accepts the complete
// desired order for the beat; ids currently in other beats are moved here.
// The whole change is one transaction so a failure leaves positions intact.
func (h *handlers) reorderShots(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := authx.UserID(ctx)
	beatID, err := httpx.PathUUID(r, "id")
	if err != nil {
		httpx.ProblemBadRequest(w, r, "invalid beat id")
		return
	}

	var req struct {
		IDs []uuid.UUID `json:"ids"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.ProblemFromDecode(w, r, err)
		return
	}

	positions, err := domain.Renumber(req.IDs)
	if err != nil {
		httpx.ProblemUnprocessable(w, r, "ids", err.Error())
		return
	}

	// Store does the move + renumber in one transaction and verifies every
	// id belongs to this user's project; a foreign id yields ErrNotFound.
	if err := h.store.ReorderShots(ctx, userID, beatID, positions); err != nil {
		httpx.ProblemFromStore(w, r, err) // maps ErrNotFound→404, else 500 (logged with stack by logx)
		return
	}

	logx.From(ctx).Info("shots reordered", "beat_id", beatID, "count", len(req.IDs))
	w.WriteHeader(http.StatusNoContent)
}
```

## 5. Outbound call with degraded mode

```go
// cameraFor returns the project's default camera from the gear service.
// A gear outage must not break project loading, so on error we return
// nil and a warning that the caller surfaces in `derived.warnings`; the
// outbound failure itself is logged by clientx with the request id.
func (s *snapshotBuilder) cameraFor(ctx context.Context, id *uuid.UUID) (*clientx.Camera, string) {
	if id == nil {
		return nil, ""
	}
	cam, err := s.gear.Camera(ctx, *id) // cached 60 s
	if err != nil {
		return nil, "gear_unavailable"
	}
	return cam, ""
}
```

## 6. Log line examples (what Loki will show)

```json
{"time":"2026-11-01T10:12:00.123Z","level":"INFO","msg":"request completed","service":"planning","version":"0.1.0+a1b2c3d","pod":"shotlyst-planning-7d9f-abcde","namespace":"shotlyst","node":"k8s-cp-01","request_id":"01JD…","user_id":"6f2c…","method":"PUT","path":"/api/v1/plan/beats/{id}/shots/order","status":204,"duration_ms":12}
{"time":"…","level":"WARN","msg":"dependency unavailable","service":"planning","pod":"…","request_id":"01JD…","dependency":"gear","error":"dial tcp: connection refused","attempt":2}
{"time":"…","level":"ERROR","msg":"panic recovered","service":"media","pod":"…","request_id":"01JE…","error":"runtime error: index out of range","stack":"goroutine 1 [running]:\n…"}
```

## 7. TypeScript module header

```ts
/**
 * offline/queue.ts — persistent mutation queue for shoot mode.
 *
 * Every change made offline is appended here with a client-generated UUID
 * (the server's idempotency key) and replayed in order by sync.ts when the
 * network is back. Nothing in this module touches the DOM so it can be
 * unit-tested with fake-indexeddb.
 */
```
