# Shotlyst — Deployment (Kubernetes homelab)

Target: a small Talos Linux cluster (currently one node, 8 GB RAM) with
Prometheus/Grafana/Loki already present. Everything below is parameterised
in the Helm chart; defaults assume that environment.

## 1. Components

| Component | How | Notes |
|---|---|---|
| Shotlyst services (×6) + web | Helm chart `deploy/helm/shotlyst` | one Deployment + Service per entry in `values.services` |
| PostgreSQL | CloudNativePG operator, 1 instance, 5 Gi PVC | simplest robust Postgres on k8s; built-in backups to S3. Alternative value: `postgres.external.url` to point at an existing DB |
| Object storage | MinIO (single pod, 10 Gi PVC) or external S3 | value `s3.*` |
| Ingress | any ingress controller (ingress-nginx / Traefik) | path routing per `docs/02-architecture.md` |
| TLS / public access | Cloudflare Tunnel or Twingate | out of chart scope; the chart just exposes an Ingress or a ClusterIP |
| Secrets | plain `Secret` by default; `vault.enabled=true` renders External Secrets / Vault Agent annotations | the cluster already runs Vault — recommended for prod |
| Images | GHCR via GitHub Actions (self-hosted runner) | one image per service, tagged with git SHA and semver |

## 2. Helm chart layout

```
deploy/helm/shotlyst/
├── Chart.yaml
├── values.yaml
├── templates/
│   ├── _helpers.tpl          # labels, env block, probes — defined ONCE
│   ├── services.yaml         # range over .Values.services → Deployment + Service (+ ServiceMonitor)
│   ├── web.yaml              # nginx Deployment + Service
│   ├── ingress.yaml          # path rules generated from .Values.services[].path
│   ├── secrets.yaml          # auth keypair, DB URLs, S3 creds (unless vault.enabled)
│   ├── postgres-cnpg.yaml    # CNPG Cluster + per-service roles/schemas (if postgres.cnpg.enabled)
│   ├── minio.yaml            # if s3.minio.enabled
│   ├── migrations-job.yaml   # pre-upgrade hook Job per service: runs `<service> migrate`
│   ├── prometheusrule.yaml   # if monitoring.alerts.enabled
│   └── networkpolicy.yaml    # default deny; allow ingress→services, services→postgres/minio, planning→gear/sun, export→planning
└── README.md
```

`values.yaml` (excerpt):

```yaml
image:
  registry: ghcr.io/timkrebs/shotlyst
  tag: ""            # defaults to Chart.appVersion

services:
  identity: { path: /api/v1/auth,   db: true,  replicas: 1 }
  gear:     { path: /api/v1/gear,   db: true,  replicas: 1 }
  planning: { path: /api/v1/plan,   db: true,  replicas: 1, env: { SHOTLYST_GEAR_URL: http://shotlyst-gear:8080, SHOTLYST_SUN_URL: http://shotlyst-sun:8080 } }
  sun:      { path: /api/v1/sun,    db: false, replicas: 1 }
  media:    { path: /api/v1/media,  db: true,  replicas: 1 }
  export:   { path: /api/v1/export, db: false, replicas: 1, env: { SHOTLYST_PLANNING_URL: http://shotlyst-planning:8080 } }

resources:
  default: { requests: { cpu: 20m, memory: 48Mi }, limits: { memory: 128Mi } }

postgres:
  cnpg: { enabled: true, storage: 5Gi, backup: { enabled: false, destinationPath: s3://backups/shotlyst } }
  external: { url: "" }

s3:
  minio: { enabled: true, storage: 10Gi }
  bucket: shotlyst

ingress:
  enabled: true
  className: nginx
  host: shotlyst.home.example
  tls: false

monitoring:
  serviceMonitor: { enabled: true }
  alerts: { enabled: true }

vault:
  enabled: false
  # when true: secrets are not rendered; ExternalSecret objects reference
  # kv/shotlyst/* in the cluster's Vault

logLevel: info
```

## 3. Install

```bash
# prerequisites once: CNPG operator, ingress controller, (optional) ESO/Vault
helm upgrade --install shotlyst deploy/helm/shotlyst \
  -n shotlyst --create-namespace \
  -f deploy/helm/shotlyst/values.yaml \
  -f my-values.yaml          # host, tag, secrets
kubectl -n shotlyst get pods
```

Pre-upgrade hook Jobs run migrations for each DB-backed service before the
new Deployments roll; services start with `SHOTLYST_AUTO_MIGRATE=false` in
the cluster (true only in Compose).

## 4. CI/CD (GitHub Actions, self-hosted runner)

1. `lint-test`: `make lint test` (Postgres via testcontainers on the runner).
2. `build`: matrix over services → `docker build --build-arg SERVICE=$svc`,
   push `ghcr.io/…/shotlyst-$svc:$sha` (+ `:vX.Y.Z` on tags).
3. `deploy` (on tag): `helm upgrade --install … --set image.tag=$tag` using
   a kubeconfig secret scoped to the `shotlyst` namespace.
   Alternative: Argo CD / Flux watching `deploy/` — add later if desired.

## 5. Backup & restore

- Postgres: CNPG scheduled backup to the MinIO bucket `backups/` (enable
  `postgres.cnpg.backup`), or a CronJob running `pg_dump` to S3.
- MinIO data: PVC snapshot or `mc mirror` to the Proxmox NAS.
- Restore procedure documented in `deploy/helm/shotlyst/README.md`
  (must be tested once before relying on it).

## 6. Hardening defaults in the chart

- `runAsNonRoot`, read-only root FS, no capabilities, seccomp
  `RuntimeDefault` (Talos enforces Pod Security "baseline" by default;
  these settings satisfy "restricted").
- NetworkPolicy default deny with explicit allows.
- Images from distroless base; one process per container.
- PodDisruptionBudget skipped on single node (would block drains).

## 7. Open questions

- **S3 implementation.** The upstream `minio/minio` image could not be
  pulled from Docker Hub or quay.io during M0 (MinIO stopped publishing
  free community images). Until this is decided, Compose runs MinIO only
  under the `media` profile (`docker compose --profile media up`) and the
  chart ships with `s3.minio.enabled: false`. Candidates: a pinned
  community MinIO build, Garage, SeaweedFS, or an S3 service outside the
  cluster. The services only see `SHOTLYST_S3_*`, so any S3-compatible store
  works. Needs a decision before M1 (media).
