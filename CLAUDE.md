# CLAUDE.md — Shotlyst

Shotlyst is a shoot-planning app for solo filmmakers: idea → beats → shot
list → offline shoot-mode checklist. It is built as a small set of Go
microservices plus a React PWA, deployed with Helm to a single-node
Kubernetes homelab. Read `docs/` before writing code; the docs are the spec.
If you must deviate, update the relevant doc in the same commit and explain
why in the commit message.

## Start here

1. `docs/01-requirements.md` — what and why
2. `docs/02-architecture.md` — services, repo layout, ADRs  ← read fully
3. `docs/03-data-model.md` — schemas per service, enums, derived rules
4. `docs/04-api.md` + `api/*.yaml` — API contracts per service
5. `docs/05-ui-spec.md` — screens and offline behaviour
6. `docs/06-implementation-plan.md` — milestones; work top-down
7. `docs/07-deployment.md` — Helm chart, cluster, CI/CD
8. `docs/08-observability.md` — logging contract (pod-level), metrics, alerts

Current milestone: **M0 — shared library, `sun` + `identity`, deploy pipeline.**

## The three principles (in priority order)

1. **Simple.** One process per bounded context, plain HTTP/JSON between
   services, one Postgres with a schema per service, no broker, no gateway,
   no tracing in MVP. If a design needs a diagram with more than six boxes,
   it is too complex for this project.
2. **DRY.** Anything two services need lives in `pkg/` — once. A `main.go`
   is ≤ 20 lines and only calls `app.Run`. A new service is: `cmd/<name>/main.go`
   + `services/<name>/` + `api/<name>.yaml` + one entry in Compose, Helm
   `values.services` and the CI matrix. Nothing else. `dupl` in lint fails
   the build on copy-paste.
3. **Observable.** Every failure must be diagnosable from Loki/Grafana with
   the pod name, request ID and user ID. Follow `docs/08-observability.md`
   exactly; it is implemented once in `pkg/logx`, `pkg/httpx`, `pkg/clientx`,
   `pkg/app`.

## Stack (do not swap without asking)

- Go 1.23+, chi, pgx v5, sqlc, goose, slog, Prometheus client, testcontainers-go
- PostgreSQL 16 (CloudNativePG in cluster), S3-compatible storage (MinIO)
- React 18, TypeScript strict, Vite, Tailwind, TanStack Router + Query, Zustand, dnd-kit, idb, vite-plugin-pwa, Vitest, Testing Library, Playwright
- Helm 3, GitHub Actions, GHCR

## Commands

```
make dev            # docker compose up: postgres, minio, caddy router, all services (air), vite
make test           # go test ./... && web tests
make lint           # golangci-lint (incl. dupl, revive doc comments) && eslint && tsc
make gen            # sqlc generate (all services) && openapi TS clients → web/src/api/<service>/
make migrate SVC=x  # goose up for one service against its schema
make build          # all binaries + web
make docker SVC=x   # build one service image
make helm-lint      # helm lint + template snapshot
```

Run `make lint test` before every commit.

## Repository shape

```
cmd/<service>/main.go     ← tiny; only app.Run(...)
pkg/                      ← shared library (app, logx, httpx, authx, dbx, clientx, config, metrics, ids, storage)
services/<service>/       ← handlers*.go, domain/, store/, migrations/, queries/, *_test.go
api/<service>.yaml        ← OpenAPI per service
web/                      ← PWA
deploy/helm/shotlyst/     ← one generic template for all services
docs/                     ← spec
```

Services and ingress prefixes: identity `/api/v1/auth`, gear `/api/v1/gear`,
planning `/api/v1/plan`, sun `/api/v1/sun`, media `/api/v1/media`,
export `/api/v1/export`.

## Go conventions

- **Comments:** every package has a `doc.go` or a package comment stating
  what it owns and what it must not do. Every exported type/func has a doc
  comment that says *why it exists*, not just what it does. Non-obvious
  blocks (ordering renumber, sync LWW, cache fallback) get a short
  paragraph comment above them. Lint enforces exported-symbol comments.
- Handlers are thin: decode → validate → store/domain → encode. No business
  rules in handlers; no HTTP or SQL in `domain`.
- `domain` packages are pure: no I/O, no `time.Now()` (inject a clock), fully
  unit-tested with table tests.
- Every store query that touches user data takes `user_id` and filters on it.
  Another user's resource → 404, never 403.
- SQL in `services/<svc>/queries/*.sql`; sqlc output committed in `store/`.
  Migrations forward-only, `NNNN_name.sql`, scoped to the service's schema.
- Errors: wrap with `%w` and context (`"reorder shots: %w"`); map to
  problem+json only in handlers via `httpx.Problem*`. Never `panic` in a
  request path; `logx` recovers and logs anyway.
- Logging: `logx.From(ctx)` only. Log outcomes at the edge (handler,
  outbound call), not in every layer. No bodies, tokens or passwords in logs.
  `WARN` = expected failure, `ERROR` = a human should look.
- Service-to-service calls only via `pkg/clientx` clients; forward the
  caller's token; never add an internal bypass. Handle dependency failure by
  degrading (null + warning) where the spec says so.
- Transactions for any multi-row write (reorder, sync, duplicate).
- Config via `pkg/config` from env `SHOTLYST_*`; document every new var in
  README, `.env.example`, Helm `values.yaml`.

## TypeScript / React conventions

- Strict TS, no `any`. API types only from generated clients.
- Feature folders `web/src/features/<name>/`; shared UI in `components/`.
- Server state in TanStack Query; UI state in Zustand/component state; never
  mirror server data in Zustand.
- All strings through `t('key')`; English in `i18n/en.json`.
- Shoot-mode code must not import drag-and-drop or desktop-only modules.
- `web/src/offline/` is unit-tested without a DOM.
- Short file-header comment on every module stating its purpose.

## Kubernetes / Helm conventions

- One generic Deployment/Service template rendered from `values.services`;
  never hand-write a per-service manifest.
- Every pod: Downward API env (`POD_NAME`, `POD_NAMESPACE`, `NODE_NAME`),
  liveness `/healthz`, readiness `/readyz`, `/metrics` annotations, resource
  requests/limits from `resources.default`, non-root, read-only FS.
- Migrations run in a pre-upgrade hook Job (`<service> migrate`), never on
  pod start in the cluster.
- `helm lint` and a template snapshot test run in CI.

## Testing

- `pkg/*`: unit tests; `dbx` and `httpx` have integration tests with
  testcontainers.
- Each service: handler tests against a real Postgres (testcontainers),
  dependency services faked with `httptest` — including the *down* case.
- Sun: Go and TS both tested against `docs/test-vectors/sun.json`.
- Frontend: Vitest; Playwright for login→project→export and the offline
  shoot-mode flow.

## Git

- Small green commits on `main`; message `<area>: <imperative summary>`
  (areas: `pkg`, `identity`, `gear`, `planning`, `sun`, `media`, `export`,
  `web`, `shoot-mode`, `offline`, `deploy`, `ci`, `docs`).
- Tick the task checkbox in `docs/06-implementation-plan.md` in the same
  commit that completes it.

## When unsure

- Choose the simpler option that keeps the data model and API contracts
  intact; leave `// TODO(spec):` and add a line to the doc's open questions.
- Ask before: adding a service, changing an enum, changing the sync
  protocol or auth scheme, adding a broker/queue/tracing, or a dependency
  with a large footprint.
