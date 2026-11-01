# Shotlyst — Architecture (microservices)

Guiding principles, in order: **simple → DRY → observable**. Microservices
here means *one process per bounded context* with a shared library, not a
service per table. Everything runs on a small single-node Kubernetes cluster
(8 GB RAM), so each service must be a static Go binary with a ~64 MB request.

## 1. Services

| Service | Owns (DB schema) | Responsibilities | Talks to |
|---|---|---|---|
| `identity` | `identity.*` — users, sessions | register/login/logout, issues signed session tokens, `/auth/me` | — |
| `gear` | `gear.*` — cameras, lenses | CRUD, built-in presets | — |
| `planning` | `planning.*` — projects, locations, shoot_days, beats, shots, shot_references, idea_cards, sync_log | the core domain: CRUD, ordering, derived values, project snapshot, offline sync | `gear` (crop factor, lens data), `sun` (sun times for shoot days) |
| `sun` | none (stateless) | sunrise/sunset/golden/blue hour for lat/lon/date | — |
| `media` | `media.*` — assets | uploads (reference images, voice memos), MIME sniff, EXIF strip, thumbnails, presigned download URLs | S3 |
| `export` | none | CSV / Markdown (later PDF) from a project snapshot | `planning` |
| `web` | — | nginx serving the built SPA | — |
| `ai` (Phase 3) | `ai.*` — runs | draft shot lists, coverage review | `planning`, LLM provider |

Why these boundaries: `planning` stays one service because beats, shots,
shoot days and sync are one transactional unit (reorders and sync touch
several tables at once). Splitting them would force distributed
transactions for no benefit. `gear`, `identity`, `media` have clearly
separate lifecycles and no cross-table transactions with planning.

## 2. Topology

```
                     ┌────────────── Ingress (path routing) ──────────────┐
  Browser PWA ─────▶ │ /            → web                                 │
                     │ /api/v1/auth → identity                            │
                     │ /api/v1/gear → gear                                │
                     │ /api/v1/plan → planning                            │
                     │ /api/v1/sun  → sun                                 │
                     │ /api/v1/media→ media                               │
                     │ /api/v1/export → export                            │
                     └────────────────────────────────────────────────────┘
                                  │ service-to-service: plain HTTP/JSON
                                  │ on the cluster network (ClusterIP)
   planning ──▶ gear, sun        export ──▶ planning        media ──▶ S3

   One PostgreSQL instance, one database, one schema per service.
   One MinIO (or external S3). Logs: stdout JSON → Loki. Metrics: /metrics → Prometheus.
```

No API gateway service: the ingress does path routing, and every service
verifies the session token itself via the shared `pkg/authx` (stateless,
Ed25519-signed). That removes a hop and a component while staying DRY.

Each API path is prefixed with its service name (`/api/v1/plan/projects`),
so ingress rules are plain prefix matches — no regex, no overlaps. The
ingress does **not** strip the prefix (a `Prefix` path rule never does, and
stripping needs controller-specific annotations); every service mounts its
API under its own prefix (`app.Options.Prefix`), so the same URL works via
the ingress, via Caddy in Compose (`handle`, not `handle_path`) and for
service-to-service calls (`http://shotlyst-gear:8080/api/v1/gear/...`).
Logs and metrics therefore show the full route pattern.

## 3. Repository layout (single Go module, DRY by construction)

```
shotlyst/
├── CLAUDE.md
├── docs/
├── go.mod                        # ONE module: github.com/timkrebs/shotlyst
├── Makefile
├── Dockerfile                    # generic: --build-arg SERVICE=planning
├── docker-compose.yml            # local dev: all services + postgres + minio
├── cmd/                          # one tiny main.go per service, ~40 lines each
│   ├── identity/main.go
│   ├── gear/main.go
│   ├── planning/main.go
│   ├── sun/main.go
│   ├── media/main.go
│   └── export/main.go
├── pkg/                          # SHARED LIBRARY — the DRY layer
│   ├── app/        # Run(): config → logger → db → router → server with graceful shutdown; every main.go calls this
│   ├── logx/       # slog JSON logger with service/pod/namespace/node/version fields, request logging middleware, panic recovery
│   ├── httpx/      # chi router factory, standard middleware stack, problem+json helpers, JSON decode/encode, validation errors, /healthz /readyz /metrics
│   ├── authx/      # session token sign/verify (Ed25519), RequireUser middleware, UserID(ctx)
│   ├── dbx/        # pgx pool, goose migration runner (per-service schema), tx helper, testcontainers helper
│   ├── clientx/    # http.Client with timeouts, retries, request-id propagation; typed clients: gear.Client, sun.Client, planning.Client
│   ├── config/     # env loading with defaults and required-check
│   ├── metrics/    # Prometheus registry + standard HTTP metrics
│   └── ids/        # UUID helpers, idempotency key parsing
├── services/                     # one folder per service; same internal shape
│   ├── identity/
│   │   ├── handlers.go  store.go  domain.go  migrations/  queries/  handlers_test.go
│   ├── gear/
│   ├── planning/
│   │   ├── handlers_projects.go handlers_beats.go handlers_shots.go handlers_sync.go
│   │   ├── domain/      # derived values, ordering, sync rules — pure, no I/O
│   │   ├── store/       # sqlc output + queries
│   │   └── migrations/
│   ├── sun/
│   ├── media/
│   └── export/
├── api/                          # OpenAPI per service; TS client generated into web/src/api/<service>
│   ├── identity.yaml  gear.yaml  planning.yaml  sun.yaml  media.yaml  export.yaml
├── web/                          # React/Vite PWA (unchanged from the monolith plan)
└── deploy/
    ├── helm/shotlyst/            # umbrella chart; one generic template for all services
    └── kustomize/ (optional)     # per-environment overlays
```

Rules that keep it DRY:
- A `main.go` may only call `app.Run(app.Options[planning.Config]{Name: "planning", Prefix: planning.Prefix, Routes: planning.Routes, Migrations: planning.Migrations})`. `Options` is generic over the service's own config struct, which `pkg/app` loads and logs (redacted) alongside the shared settings. No wiring logic in `main`.
- Middleware, logging, errors, auth, DB setup, metrics and health endpoints exist **once** in `pkg/`. Services never reimplement them.
- Service-to-service clients live in `pkg/clientx` so the calling convention (timeouts, retries, headers) is identical everywhere.
- One Dockerfile with `ARG SERVICE`; one Helm template rendered N times from `values.services`.
- One `go test ./...`, one lint config, one CI pipeline.

## 4. Cross-service concerns

### Authentication (stateless)
`identity` issues a session token = base64(payload) + Ed25519 signature,
payload `{sub: user_id, sid: session_id, exp}`. Set as HttpOnly cookie
`shotlyst_session`. Every service verifies the signature with the public key
(env `SHOTLYST_AUTH_PUBLIC_KEY`); only `identity` holds the private key.
Logout = `identity` marks the session revoked; other services accept the
token until `exp` (≤ 24 h, refreshed silently by the SPA) — acceptable for a
personal tool, documented trade-off.

CSRF: state-changing requests must carry header `X-Shotlyst-Client: web`
(the browser's CORS rules block cross-site custom headers). Enforced in
`httpx` middleware. No token dance.

### Service-to-service calls
Plain HTTP/JSON over ClusterIP DNS (`http://gear.shotlyst.svc:8080`). The
caller forwards the user's session cookie as `Authorization: Bearer <token>`
so the callee applies the same authz rules — no service accounts, no
internal bypass. Request ID is propagated via `X-Request-Id`. Clients retry
GETs twice with backoff; never retry non-idempotent calls.

### Data ownership
One Postgres instance, one database `shotlyst`, one **schema per service**
(`identity`, `gear`, `planning`, `media`). A service only migrates and
queries its own schema; the DB role per service is restricted accordingly
(Helm creates roles). Cross-service references (e.g., `shots.lens_id`) are
plain UUID columns without foreign keys; the owning service validates
existence via the client at write time.

### Derived values needing other services
`planning` needs the project's default camera crop factor and lens image
circle. It calls `gear` and caches results in-process for 60 s (tiny LRU in
`clientx`). If `gear` is down, derived values are returned as `null` with
`derived.warnings: ["gear_unavailable"]` — the snapshot still loads. Same
pattern for `sun`.

### Offline sync
Lives entirely in `planning` (`POST /api/v1/plan/sync`). Unchanged protocol
from `docs/04-api.md`.

## 5. Observability (details in `docs/08-observability.md`)

- **Logs:** every service writes JSON lines to stdout via `pkg/logx`. Every
  line has `service`, `version`, `pod`, `namespace`, `node` (from the
  Downward API), and per-request `request_id`, `user_id`, `method`, `path`,
  `status`, `duration_ms`. Errors include `error` and, for 5xx, a stack.
  Loki picks them up from the pod. Startup logs config (secrets redacted);
  shutdown logs the reason; panics are recovered, logged at `error` with
  stack, and return 500.
- **Metrics:** `/metrics` on every service (request count/duration by route
  and status, DB pool stats, outbound client calls). Prometheus scrapes via
  pod annotations.
- **Health:** `/healthz` (process up) and `/readyz` (DB reachable +
  dependencies' `/healthz` optional).
- **Tracing:** not in MVP. Request-ID correlation across services is enough
  for a homelab; OpenTelemetry can be added in `pkg/httpx` later without
  touching services.

## 6. ADRs (short)

- **ADR-1 Shared `pkg/` over copy-paste.** Any helper used by two services
  moves to `pkg/`. Reviewed in CI by a `gocyclo`/duplication check (`dupl`).
- **ADR-2 Schema-per-service in one Postgres.** Isolation without running
  N databases on an 8 GB node.
- **ADR-3 Stateless signed sessions.** So services don't call `identity`
  on every request.
- **ADR-4 Ingress path routing, no gateway.** Fewer moving parts.
- **ADR-5 Sync HTTP only, no message broker in MVP.** Nothing in the
  domain is asynchronous yet; media thumbnails are generated inline (small
  images). If a queue is ever needed, use NATS JetStream — one small pod.
- **ADR-6 Derived values computed in `planning`, sun in `sun`.** Rules
  unchanged from the monolith plan; sun is separate because it is stateless,
  reusable and a good minimal service template.
- **ADR-7 Gap-based ordering, LWW sync** — unchanged (see data model doc).

## 7. Local development

`docker compose up` starts Postgres, MinIO, all six services (with `air`
hot reload) and the Vite dev server; a tiny Caddy container does the same
path routing as the ingress so the SPA talks to one origin
(`http://localhost:8080`). Compose and Helm share the same env var names.

## 8. Resource budget (single node, 8 GB)

| Component | requests cpu/mem | limits mem |
|---|---|---|
| each Go service (×6) | 20m / 48Mi | 128Mi |
| web (nginx) | 10m / 16Mi | 64Mi |
| postgres (CloudNativePG, 1 instance) | 200m / 512Mi | 1Gi |
| minio | 50m / 128Mi | 512Mi |
| **total** | ~0.4 CPU / ~1 GiB | ~2.5 GiB |

Leaves plenty of headroom next to Prometheus/Loki on the same node.
