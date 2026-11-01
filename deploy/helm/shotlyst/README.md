# Shotlyst Helm chart

One chart for the whole app: every entry in `values.services` becomes a
Deployment, a Service, an ingress path, NetworkPolicy rules and (when
`db: true`) a Postgres role, schema, DB secret and migration Job. The
design rationale is in `docs/07-deployment.md`; this file covers operating
the chart.

## Prerequisites (cluster-wide, installed once)

| Needed for | Install |
|---|---|
| PVCs (Postgres, MinIO) | a default StorageClass, or set `postgres.cnpg.storageClass` |
| `postgres.cnpg.enabled` (default) | CloudNativePG operator **≥ 1.26** |
| `ingress.enabled` (default) | an ingress controller matching `ingress.className` |
| `vault.enabled` | External Secrets Operator + a `ClusterSecretStore` named `vault.secretStore` |
| ServiceMonitor / alerts | Prometheus Operator (skipped automatically if its CRDs are missing) |
| NetworkPolicy enforcement | a CNI that implements it (Cilium, Calico); flannel ignores the objects |

The chart fails to render, with a message naming the missing value or CRD,
when CNPG is enabled but not installed, or when the auth keys are missing.

## Install / upgrade

```bash
go run ./cmd/keygen    # prints SHOTLYST_AUTH_PRIVATE_KEY / _PUBLIC_KEY

cat > my-values.yaml <<'EOF'
image: { tag: v0.1.0 }
ingress: { host: shotlyst.example.lan }
auth:
  privateKey: <SHOTLYST_AUTH_PRIVATE_KEY>
  publicKey: <SHOTLYST_AUTH_PUBLIC_KEY>
EOF

helm upgrade --install shotlyst deploy/helm/shotlyst \
  -n shotlyst --create-namespace -f my-values.yaml
kubectl -n shotlyst get pods,jobs
```

Keep `my-values.yaml` out of git. **Do not lose the private key**: the
per-service database passwords are derived from it (unless
`postgres.passwordSeed` is set), so a new key means new DB passwords, which
CNPG then rolls out automatically through the managed roles.

### Migrations

`<service> migrate` runs as a Helm hook Job per DB-backed service:
`pre-upgrade` on upgrades (schema first, then new pods), `post-install` on
the first install and for a service that is new in this release (its role
and secret do not exist before then). Logs:
`kubectl -n shotlyst logs job/shotlyst-<service>-migrate`. A failed Job
fails the `helm upgrade`, and the old pods keep running.

## Values

The commented `values.yaml` is the reference. The ones you are most likely
to set:

| Key | Default | Purpose |
|---|---|---|
| `image.tag` | `Chart.appVersion` | image tag for every service and web |
| `image.pullSecrets` | `[]` | e.g. `[{name: ghcr}]` for private GHCR packages |
| `services.<name>` | identity, sun | `path`, `db`, `s3`, `calls`, `env`, `replicas`, `resources` |
| `ingress.host` / `tls` / `className` | `shotlyst.home.local` / `false` / `nginx` | also sets `SHOTLYST_BASE_URL` |
| `trustedProxies` | `1` | proxy hops in front of the pods (client IP for logs and rate limits) |
| `auth.privateKey` / `publicKey` | — | Ed25519 keys from `cmd/keygen`; required unless `vault.enabled` |
| `postgres.external.url` | `""` | use an existing Postgres instead of CNPG |
| `postgres.cnpg.backup.*` | disabled | WAL archive + daily base backup to S3 |
| `s3.*` | MinIO disabled | endpoint, bucket and credentials (see docs/07 §7) |
| `networkPolicy.allowFromNamespaces` | `[ingress-nginx, monitoring]` | who may reach the pods on :8080 |
| `logLevel` | `info` | `debug` also logs SQL query names and probe requests |

## Backups

Set `postgres.cnpg.backup.enabled=true` (and a reachable `s3.endpoint` with
an existing bucket for `destinationPath`). CNPG then archives WAL
continuously and a `ScheduledBackup` takes a base backup daily at 03:00;
both are pruned after `retention` (14 days). Check them with:

```bash
kubectl -n shotlyst get backups
kubectl -n shotlyst get cluster shotlyst-pg -o jsonpath='{.status.lastSuccessfulBackup}'
```

Object storage (media files) is not covered by this; mirror the bucket
separately (e.g. `mc mirror` to the NAS).

## Restore

> **Untested.** Rehearse this once on a scratch namespace before relying
> on it (docs/07 §5).

The cluster is rebuilt from the archive: CNPG only applies `bootstrap` when
it *creates* a Cluster, so the old one has to go first. Everything written
after the recovery target is lost.

1. Note the archive you are restoring from: `backup.serverName`, or
   `<release>-pg` (e.g. `shotlyst-pg`) if it was never set.
2. Stop the services so nothing writes during the restore:
   ```bash
   kubectl -n shotlyst scale deploy -l app.kubernetes.io/instance=shotlyst --replicas=0
   ```
3. Delete the database cluster (its PVCs go with it):
   ```bash
   kubectl -n shotlyst delete cluster shotlyst-pg
   ```
4. Add to `my-values.yaml` **and keep it there afterwards**:
   ```yaml
   postgres:
     cnpg:
       backup:
         enabled: true
         serverName: shotlyst-pg-r1      # new archive folder; must differ from the source
       recovery:
         enabled: true
         serverName: shotlyst-pg         # the archive from step 1
         targetTime: ""                  # or e.g. "2026-11-01T10:00:00Z" for point-in-time
   ```
5. Recreate the cluster without hooks (the migration Job would otherwise
   wait for a database that does not exist yet):
   ```bash
   helm upgrade shotlyst deploy/helm/shotlyst -n shotlyst -f my-values.yaml --no-hooks
   kubectl -n shotlyst wait cluster/shotlyst-pg --for=condition=Ready --timeout=15m
   ```
6. Run the same upgrade again *with* hooks, so migrations bring the schemas
   up to the current release, and restart the services:
   ```bash
   helm upgrade shotlyst deploy/helm/shotlyst -n shotlyst -f my-values.yaml
   kubectl -n shotlyst scale deploy -l app.kubernetes.io/instance=shotlyst --replicas=1
   ```
7. Check: log in, open a project; `kubectl -n shotlyst get backups` shows
   new backups under the new `serverName` the next day.

For a later restore, repeat with `recovery.serverName` set to the current
archive (`shotlyst-pg-r1`) and a new `backup.serverName` (`-r2`).

## Developing the chart

```bash
make helm-lint       # helm lint + diff the render against ci/snapshot.yaml
make helm-snapshot   # accept an intended change, then review the diff in git
```

`ci/test-values.yaml` holds placeholder keys; the snapshot renders as if
the CNPG and Prometheus Operator CRDs were installed so every template is
covered.
