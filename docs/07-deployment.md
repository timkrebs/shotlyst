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
│   ├── services.yaml         # range over .Values.services → Deployment + Service
│   ├── web.yaml              # nginx Deployment + Service
│   ├── ingress.yaml          # path rules generated from .Values.services[].path
│   ├── secrets.yaml          # auth keypair, per-service DB secrets, S3 creds (auth/S3 unless vault.enabled)
│   ├── externalsecrets.yaml  # if vault.enabled: ExternalSecrets for auth + S3
│   ├── postgres-cnpg.yaml    # CNPG Cluster + managed roles + Database CR with per-service schemas
│   ├── minio.yaml            # if s3.minio.enabled
│   ├── migrations-job.yaml   # hook Job per DB service: runs `<service> migrate`
│   ├── servicemonitor.yaml   # if the Prometheus Operator CRDs exist
│   ├── prometheusrule.yaml   # if monitoring.alerts.enabled and the CRDs exist
│   └── networkpolicy.yaml    # default deny; DNS, http-in, `calls`, postgres, s3 allows
├── ci/
│   ├── test-values.yaml      # fixed placeholder keys for lint/snapshot
│   └── snapshot.yaml         # `make helm-lint` diffs the render against this
└── README.md                 # install, values, backup/restore
```

`values.yaml` (excerpt):

```yaml
image:
  registry: ghcr.io/timkrebs/shotlyst
  tag: ""            # defaults to Chart.appVersion

# Entries are added as each service's milestone ships (M0: identity, sun).
# `calls` drives the service→service NetworkPolicies; `s3` mounts S3 creds.
services:
  identity: { path: /api/v1/auth,   db: true }
  gear:     { path: /api/v1/gear,   db: true }
  planning: { path: /api/v1/plan,   db: true,  calls: [gear, sun, media], env: { SHOTLYST_GEAR_URL: http://shotlyst-gear:8080, SHOTLYST_SUN_URL: http://shotlyst-sun:8080 } }
  sun:      { path: /api/v1/sun,    db: false }
  media:    { path: /api/v1/media,  db: true,  s3: true }
  export:   { path: /api/v1/export, db: false, calls: [planning], env: { SHOTLYST_PLANNING_URL: http://shotlyst-planning:8080 } }

resources:
  default: { requests: { cpu: 20m, memory: 48Mi }, limits: { memory: 128Mi } }

postgres:
  cnpg:
    enabled: true
    storage: 5Gi
    backup: { enabled: false, destinationPath: s3://backups/shotlyst, schedule: "0 0 3 * * *", retention: 14d, serverName: "" }
    recovery: { enabled: false, serverName: "", targetTime: "" }   # bootstrap from the archive (chart README "Restore")
  external: { url: "" }
  passwordSeed: ""   # per-service role passwords = sha256(seed/db/<svc>); defaults to auth.privateKey

s3:
  minio: { enabled: false, storage: 10Gi }   # see §7 open questions
  bucket: shotlyst

trustedProxies: 1    # proxy hops in front of the pods → SHOTLYST_TRUSTED_PROXIES

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
# prerequisites once: a default StorageClass, CNPG operator (>= 1.26, for the
# Database CR's schema management), an ingress controller, (optional) ESO/Vault
helm upgrade --install shotlyst deploy/helm/shotlyst \
  -n shotlyst --create-namespace \
  -f deploy/helm/shotlyst/values.yaml \
  -f my-values.yaml          # host, tag, secrets
kubectl -n shotlyst get pods
```

Hook Jobs run `<service> migrate` for each DB-backed service; services
start with `SHOTLYST_AUTO_MIGRATE=false` in the cluster (true only in
Compose). On upgrades the Job is a `pre-upgrade` hook, so the schema is
migrated before the new Deployments roll (migrations must therefore stay
backwards-compatible with the running version — they are forward-only and
additive anyway). On the first install the Job runs `post-install`: a
pre-install hook would run before the chart's DB Secret and CNPG Cluster
exist. The chart decides per service by looking up its DB Secret, so a
service added in an upgrade also migrates post-upgrade; `helm template`
cannot see the cluster and always renders the post-install variant. The
command waits up to 2 min for Postgres, and the Job retries 4 times.

The chart refuses to render with `postgres.cnpg.enabled=true` when the CNPG
CRDs are missing, and without `auth.privateKey`/`publicKey` (unless
`vault.enabled`). ServiceMonitor and PrometheusRule render only when the
Prometheus Operator CRDs exist; the `prometheus.io/*` pod annotations are
the scrape contract otherwise.

## 4. CI/CD (GitHub Actions, self-hosted runner)

1. `lint-test`: `make lint test` (Postgres via testcontainers on the runner).
2. `build`: matrix over services → `docker build --build-arg SERVICE=$svc`,
   push `ghcr.io/…/shotlyst-$svc:$sha` (+ `:vX.Y.Z` on tags).
3. `deploy` (on tag): `helm upgrade --install … --set image.tag=$tag` using
   a kubeconfig secret scoped to the `shotlyst` namespace.
   Alternative: Argo CD / Flux watching `deploy/` — add later if desired.

## 5. Backup & restore

- Postgres: CNPG continuous WAL archiving plus a daily `ScheduledBackup` to
  the S3 bucket `backups/` (enable `postgres.cnpg.backup`). Restore is a
  values switch (`postgres.cnpg.recovery`) that bootstraps a new Cluster
  from the archive, optionally to a point in time.
- MinIO data: PVC snapshot or `mc mirror` to the Proxmox NAS.
- Restore procedure documented in `deploy/helm/shotlyst/README.md`
  (must be tested once before relying on it).

## 6. Hardening defaults in the chart

- `runAsNonRoot`, read-only root FS, no capabilities, seccomp
  `RuntimeDefault` (Talos enforces Pod Security "baseline" by default;
  these settings satisfy "restricted").
- NetworkPolicy default deny with explicit allows. Enforcement needs a CNI
  that implements NetworkPolicy (Cilium, Calico); flannel alone accepts the
  objects but ignores them.
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
- **Cluster prerequisites.** As of M0 the homelab cluster has no
  StorageClass, CNPG operator, ingress controller or Loki/Prometheus/Grafana
  (and its flannel CNI does not enforce NetworkPolicy), although §1 assumes
  the monitoring stack is present. These have to be installed before the
  M0 deploy; they are cluster-wide, so they are kept out of this chart.
