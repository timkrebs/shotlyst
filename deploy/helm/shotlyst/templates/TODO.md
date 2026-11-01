Remaining templates to add in Milestone 0.14 (see docs/07-deployment.md):
- web.yaml                 nginx Deployment + Service for the SPA
- secrets.yaml             auth keypair, per-service DB URLs, S3 creds (skip when vault.enabled)
- externalsecrets.yaml     when vault.enabled
- postgres-cnpg.yaml       CNPG Cluster + init Job creating one schema/role per db-backed service
- minio.yaml               single-pod MinIO + PVC
- migrations-job.yaml      pre-upgrade hook Job per db-backed service running `<service> migrate`
- servicemonitor.yaml      when monitoring.serviceMonitor.enabled
- prometheusrule.yaml      alerts from docs/08-observability.md §5
- networkpolicy.yaml       default deny; allow ingress→services, services→postgres/minio, planning→gear/sun/media, export→planning
Delete this file when done.
