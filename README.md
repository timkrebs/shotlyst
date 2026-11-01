# Shotlyst

Shoot planning for solo filmmakers and small teams: idea → beats → shot
list → offline checklist on location.

> Status: specification complete, implementation starting at Milestone 0.
> See `docs/06-implementation-plan.md`.
>
> Architecture: six small Go services (identity, gear, planning, sun, media,
> export) sharing one library (`pkg/`), one Postgres with a schema per
> service, a React PWA, deployed with one Helm chart to a Kubernetes homelab.
> Logs are JSON with pod metadata for Loki; every service exposes
> `/metrics`, `/healthz`, `/readyz`.

## What it does

- Structure a film into **beats** (scenes) with intent and target duration.
- Build a **shot list** with structured fields (size, movement, lens, focal
  length, frame rate, audio, priority) and get totals: time, lenses to pack.
- Knows your **gear**: APS-C body + full-frame lens → shows the equivalent
  focal length automatically.
- Knows the **light**: sunrise, golden hour, sunset for your location and
  shoot date — computed offline.
- **Shoot mode**: a dark, one-thumb checklist that works with no signal and
  syncs when you're back.
- Export to CSV/Markdown. Self-hosted.

## Documentation

| Doc | Purpose |
|---|---|
| `CLAUDE.md` | Conventions for AI-assisted development |
| `docs/00-kickoff-prompt.md` | Prompt to start Claude Code with |
| `docs/01-requirements.md` | PRD: personas, user stories, scope |
| `docs/02-architecture.md` | Services, repo layout, ADRs |
| `docs/03-data-model.md` | Schemas per service, enums, derived rules |
| `docs/04-api.md` | REST API per service (contracts in `api/*.yaml`) |
| `docs/05-ui-spec.md` | Screens, offline behaviour |
| `docs/06-implementation-plan.md` | Milestones and task checklist |
| `docs/07-deployment.md` | Helm chart, cluster, CI/CD, backups |
| `docs/08-observability.md` | Pod-level logging contract, metrics, alerts |
| `docs/09-code-style-examples.md` | Reference snippets for comments and structure |

## Running (once M0 is done)

```bash
cp .env.example .env
go run ./cmd/keygen >> .env     # session-token keypair
make dev                        # http://localhost:8080 (caddy routes like the ingress)
make test
```

Deploy to Kubernetes:

```bash
helm upgrade --install shotlyst deploy/helm/shotlyst -n shotlyst --create-namespace -f my-values.yaml
```

## Configuration

| Variable | Default | Description |
|---|---|---|
All services read `SHOTLYST_*` env vars via `pkg/config`; only the ones a
service needs are required for it.

| Variable | Default | Description |
|---|---|---|
| `SHOTLYST_DATABASE_URL` | — | Postgres DSN (db-backed services) |
| `SHOTLYST_AUTH_PUBLIC_KEY` | — | Ed25519 public key, base64 (all services) |
| `SHOTLYST_AUTH_PRIVATE_KEY` | — | Ed25519 private key, base64 (identity only) |
| `SHOTLYST_GEAR_URL` / `_SUN_URL` / `_MEDIA_URL` | — | planning's dependencies |
| `SHOTLYST_PLANNING_URL` | — | export's dependency |
| `SHOTLYST_LOG_LEVEL` | `info` | `debug` adds SQL timings |
| `POD_NAME` / `POD_NAMESPACE` / `NODE_NAME` | — | Downward API; appear on every log line |
| `SHOTLYST_BASE_URL` | `http://localhost:8080` | Public URL (cookies, links) |
| `SHOTLYST_S3_ENDPOINT` / `_BUCKET` / `_ACCESS_KEY` / `_SECRET_KEY` | MinIO dev values | Object storage |
| `SHOTLYST_AUTO_MIGRATE` | `false` | Run migrations on start |
| `SHOTLYST_LOG_FORMAT` | `text` | `text` or `json` |
| `SHOTLYST_AI_API_KEY` | — | Phase 3 |

## License

TBD (suggest MIT or AGPL-3.0 — decide before publishing).
