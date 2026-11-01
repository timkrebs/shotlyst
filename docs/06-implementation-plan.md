# Shotlyst — Implementation Plan (microservices)

Work milestone by milestone. Each ends in a demoable, deployable state.
Commit per task; keep `docs/` truthful. Sizes are rough agent-session
estimates.

The order is deliberate: the shared library and the deploy pipeline come
first so every later service is "copy the shape of `sun`, add a schema".

---

## Milestone 0 — Shared library, first service, deploy pipeline (medium)

Already scaffolded in the kit (verify, don't redo): `Makefile`, `Dockerfile`,
`docker-compose.yml` + `docker/`, `.air.toml`, `.golangci.yml`, `api/*.yaml`
stubs, Helm `Chart.yaml`, `values.yaml`, `_helpers.tpl`, `services.yaml`,
`ingress.yaml` (remaining templates listed in `templates/TODO.md`). Run
`helm lint` early — the skeleton has not been linted yet.

Goal: `sun` (stateless) and `identity` (stateful) running in the cluster
with logs in Loki. Everything cross-cutting exists once in `pkg/`.

Tasks
- [x] 0.1 Repo init: single `go.mod` (`github.com/timkrebs/shotlyst`), `web/` Vite React TS app, `Makefile`, `.golangci.yml` (incl. `dupl`, `revive` with doc-comment rule), `.editorconfig`.
- [x] 0.2 `pkg/config`: env loading (`Load(prefix, &struct)`), required/default tags, `String()` that redacts secrets. Tests.
- [x] 0.3 `pkg/logx`: slog JSON/text handler; base fields (service, version, pod, namespace, node); `From(ctx)` / `With(ctx, logger)`; request-logging + panic-recovery middleware; `Redact`. Tests assert field presence.
- [x] 0.4 `pkg/httpx`: `NewRouter(opts)` with the standard middleware stack (request-id, real-ip, logx, recover, metrics, CSRF header check, timeout); `Problem` helpers (RFC 7807); `DecodeJSON`/`Encode`; `/healthz`, `/readyz`, `/metrics`. Tests.
- [x] 0.5 `pkg/metrics`: Prometheus registry + HTTP/outbound/db collectors.
- [x] 0.6 `pkg/dbx`: pgx pool from URL, `search_path` per service schema, goose runner with embedded FS, `Tx(ctx, fn)`, testcontainers helper `dbx/dbtest`.
- [x] 0.7 `pkg/authx`: Ed25519 keypair gen CLI (`go run ./cmd/keygen`), `Sign(payload)`, `Verify(token)`, cookie read/write, `RequireUser` middleware, `UserID(ctx)`. Tests incl. expiry and tamper.
- [x] 0.8 `pkg/clientx`: base client (timeouts, retry for idempotent, request-id + bearer propagation, outbound logging/metrics), TTL cache helper. Tests with httptest.
- [x] 0.9 `pkg/app`: `Run(Options)` — loads config, builds logger, opens DB if `Migrations != nil`, runs migrations if `AUTO_MIGRATE`, mounts routes, starts server, graceful shutdown on SIGTERM, `migrate` subcommand for the Helm hook Job. This is the **only** thing any `main.go` calls.
- [x] 0.10 `services/sun`: NOAA/Meeus solar calc in `domain`, `GET /times`, 1 h cache, tests against `docs/test-vectors/sun.json`. `cmd/sun/main.go` (≈ 15 lines).
- [x] 0.11 `services/identity`: migrations (`identity` schema: users, sessions), register/login/logout/refresh/me, argon2id, rate limit on login/register (in-memory token bucket, fine for one replica). Tests.
- [x] 0.12 OpenAPI: `api/sun.yaml`, `api/identity.yaml`; `make gen` produces TS clients.
- [x] 0.13 `Dockerfile` (generic, `ARG SERVICE`, distroless, non-root, `-ldflags "-X main.version=…"`), `docker-compose.yml` (postgres, minio, caddy router, sun, identity, web dev), `.env.example`.
- [x] 0.14 Helm chart per `docs/07-deployment.md`: generic service template, web, ingress, secrets, CNPG cluster + roles/schemas, MinIO, migration hook Job, ServiceMonitor, NetworkPolicy. `helm lint` + `helm template` snapshot test in CI.
- [x] 0.15 GitHub Actions: lint, test, build matrix (per service), push to GHCR, helm lint; `deploy` job on tag.
- [x] 0.16 Frontend shell: Tailwind, TanStack Router/Query, theme, i18n, login/register pages against identity.
- [ ] 0.17 Deploy to the homelab cluster. Verify: pods ready, `/readyz` green, Loki shows `starting`/`listening` lines with pod fields, Grafana query from `docs/08-observability.md` §3 returns the login request line.

Acceptance
- `helm upgrade --install` on the cluster → register and log in via the ingress host.
- Kill the identity pod → Loki shows `shutting down` then `starting` with the new pod name; readiness recovers.
- Every exported Go symbol in `pkg/` has a doc comment (lint enforced).

## Milestone 1 — gear + media (small)

- [ ] 1.1 `services/gear`: schema, cameras/lenses CRUD, `GET /presets` (static JSON), `POST /resolve` (batch fetch cameras+lenses by IDs — used by planning). Tests.
- [ ] 1.2 `services/media`: schema, `POST /assets` (multipart, MIME sniff, 10 MB cap, EXIF strip, thumbnail via `imaging`), `GET /assets/{id}` presigned URLs, `DELETE`, `POST /assets/resolve`. S3 client in `pkg/storage` (shared later by export PDF). Tests with MinIO testcontainer.
- [ ] 1.3 `api/gear.yaml`, `api/media.yaml`, clients regenerated.
- [ ] 1.4 Frontend `/gear` pages (sensor format → crop factor), upload component.
- [ ] 1.5 Add both services to Compose, Helm values, CI matrix. Deploy.

Acceptance
- Add "Sony FX30" (aps_c, 1.5) and lenses; upload a reference image; both survive pod restarts; logs show `user_id` on every request line.

## Milestone 2 — planning core (large)

- [ ] 2.1 Schema `planning`: locations, projects, shoot_days, beats, shots, shot_references, idea_cards, sync_log, indexes.
- [ ] 2.2 `services/planning/domain`: enums, derived values, ordering (gap renumber), totals, lens set, effective time-of-day. Pure + table tests.
- [ ] 2.3 Clients: `clientx/gear` (`Resolve`), `clientx/sun` (`Times`), `clientx/media` (`Resolve`) with TTL cache and degraded-mode warnings.
- [ ] 2.4 Handlers: projects (CRUD, duplicate), locations, shoot days (with sun times merged in), beats (CRUD, order), shots (CRUD, duplicate, order incl. cross-beat move, shoot-order, status), references, idea cards (+ promote).
- [ ] 2.5 Snapshot endpoint `GET /projects/{id}` — nested, derived, media URLs resolved, sun merged. Benchmark 200 shots < 80 ms incl. one gear call (cached).
- [ ] 2.6 `api/planning.yaml`, client regenerated.
- [ ] 2.7 Frontend: project list/overview, beats & shots view (dnd-kit), shot editor, totals bar, shortcuts, shoot days + sun strip, shoot-order view, ideas list, example project loader.
- [ ] 2.8 Tests: ordering atomicity, cross-beat move, degraded mode when gear is down (httptest server returns 503 → snapshot 200 with warning), snapshot shape.
- [ ] 2.9 Compose/Helm/CI updated. Deploy.

Acceptance
- Full planning flow in the cluster; scale `gear` to 0 → project still opens with a warning chip and `WARN dependency unavailable` in Loki; scale back → derived values return within 60 s.

## Milestone 3 — export (small)

- [ ] 3.1 `services/export`: `GET /projects/{id}?format=csv|md`, fetches snapshot via `clientx/planning` with the caller's token, renders, streams. Golden-file tests.
- [ ] 3.2 Export tab with Markdown preview. Compose/Helm/CI. Deploy.

Acceptance: CSV opens in Numbers with derived columns; Markdown matches golden files.

## Milestone 4 — shoot mode & offline (medium–large)

- [ ] 4.1 PWA: manifest, icons, Workbox precache, runtime cache for media thumbs.
- [ ] 4.2 `web/src/offline`: IndexedDB stores (snapshot, mutations, pending blobs), queue, sync engine (online detection, backoff, conflict surfacing). Unit tests without DOM.
- [ ] 4.3 Shoot mode UI per `docs/05-ui-spec.md` incl. quick add (`client_id`), voice memo via MediaRecorder (blob queued, uploaded to media on sync, then referenced in the mutation), wake lock, TS sun calc for the header (same test vectors).
- [ ] 4.4 `POST /sync` in planning: idempotent via `sync_log`, ordered, LWW on status, snapshot in response; `sync_mutations_total` metric.
- [ ] 4.5 Playwright: offline flow (setOffline, 3 status changes, 1 quick add, 1 memo, online → server state asserted).
- [ ] 4.6 Deploy; real airplane-mode test on a phone.

Acceptance: no duplicates, no lost mutations across offline/online and a pod restart mid-sync (retry is idempotent).

## Milestone 5 — release 0.1 (small)

- [ ] 5.1 Empty states, onboarding (first camera), example project.
- [ ] 5.2 Settings: profile, locale, JSON export (planning + gear fan-out via export service).
- [ ] 5.3 Accessibility pass; Lighthouse PWA ≥ 90.
- [ ] 5.4 Backup job (CNPG backup or pg_dump CronJob) and a tested restore.
- [ ] 5.5 Grafana dashboard JSON in `deploy/grafana/` (requests, errors, latency per service, sync results) + PrometheusRule alerts.
- [ ] 5.6 README + chart README; tag `v0.1.0`.

---

## Phase 2
Idea board canvas, packing list + card/battery estimates (planning), templates, light-conflict warnings, gear presets, German UI, CNPG backups to S3 by default, Argo CD app manifest.

## Phase 3
`services/ai` (draft/review, provider interface, Anthropic first), share links + comments (planning), Sony XML import (new `ingest` endpoint in planning or a small `clips` service if it grows), PDF export.

---

## Definition of done (every task)

- Code + tests + doc comments; `make lint test` green (lint enforces doc comments on exported symbols and flags duplicated code).
- If two services need the same helper, it is in `pkg/` — not copied.
- API change → `api/<service>.yaml` updated, client regenerated.
- New env var → documented in README, `.env.example`, Helm `values.yaml`.
- New service → Compose, Helm `values.services`, CI matrix, NetworkPolicy.
- Logs for the new code path verified once in Loki (or at least in Compose stdout) — failure paths included.
- Commit: `<area>: <imperative summary>`.

## Risks

| Risk | Mitigation |
|---|---|
| Microservice overhead on one node | Tiny Go binaries, 48 Mi requests; budget in `docs/02` §8. |
| Partial failures (gear down) | Degraded mode with warnings, tested in M2. |
| Token revocation lag (stateless sessions) | ≤ 24 h exp, refresh endpoint; acceptable for a personal tool, documented. |
| iOS PWA storage eviction | Small snapshot, secondary copy of the queue in localStorage, install-to-home-screen prompt. |
| Schema-per-service drift | Each service migrates only its schema; CI runs all migrations against a fresh DB. |
