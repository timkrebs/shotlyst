# Shotlyst — Observability & Pod-level Logging

Goal: when something fails in the cluster, one Loki query shows which pod,
which request, which user and why — without ssh-ing anywhere.

## 1. Logging contract (implemented once in `pkg/logx`)

Every service logs **JSON lines to stdout**. Nothing to files. Kubernetes
captures stdout; Loki (via Promtail/Alloy) indexes it with pod labels.

### Fields on every line

| Field | Source | Example |
|---|---|---|
| `time` | slog | `2026-11-01T10:12:00.123Z` |
| `level` | slog | `INFO` / `WARN` / `ERROR` |
| `msg` | code | `request completed` |
| `service` | build flag / `app.Options.Name` | `planning` |
| `version` | ldflags `-X main.version` | `0.1.3+a1b2c3d` |
| `pod` | env `POD_NAME` (Downward API) | `planning-7d9f-abcde` |
| `namespace` | env `POD_NAMESPACE` | `shotlyst` |
| `node` | env `NODE_NAME` | `k8s-cp-01` |

### Fields on request lines (middleware in `pkg/logx`)

`request_id`, `method`, `path` (route pattern, not raw URL — avoids
cardinality), `status`, `duration_ms`, `bytes_out`, `user_id` (if
authenticated), `remote_ip`, `user_agent` (truncated). One line per request
at `INFO`; 4xx at `WARN` with `problem_type`; 5xx at `ERROR` with `error`
and `stack`.

### Outbound call lines (`pkg/clientx`)

`msg="outbound call"`, `target_service`, `method`, `path`, `status`,
`duration_ms`, `attempt`, `request_id` (propagated). Failures at `WARN`
(retried) or `ERROR` (gave up).

### Lifecycle lines (`pkg/app`)

- `msg="starting"` with non-secret config (secrets rendered as `***`).
- `msg="migrations applied"` with `from`, `to` versions.
- `msg="listening"` with `addr`.
- `msg="shutting down"` with `signal` and `in_flight` count.
- `msg="panic recovered"` at `ERROR` with `stack`, `request_id`.
- `msg="dependency unavailable"` at `WARN` with `dependency` when a
  readiness check or outbound call fails.

### Rules for service code

- Get the logger from context: `logx.From(ctx)` — it already carries
  request/user fields. Never create a new logger in a handler.
- Log at the edge, not in every layer: handlers log the outcome; store and
  domain return errors with context (`fmt.Errorf("list shots: %w", err)`).
- Never log request bodies, tokens, passwords, or full emails. `logx` has a
  `Redact(email)` helper (`t***@gmail.com`).
- Use `WARN` for expected failures (validation, not found, conflict) and
  `ERROR` only for things a human should look at.
- Every `ERROR` must be actionable: say what failed and with which IDs.

### Log level

`SHOTLYST_LOG_LEVEL` env (`debug|info|warn|error`), default `info`. Debug
adds SQL query names and durations from `dbx`.

## 2. Kubernetes wiring (in the Helm template)

```yaml
env:
  - name: POD_NAME
    valueFrom: { fieldRef: { fieldPath: metadata.name } }
  - name: POD_NAMESPACE
    valueFrom: { fieldRef: { fieldPath: metadata.namespace } }
  - name: NODE_NAME
    valueFrom: { fieldRef: { fieldPath: spec.nodeName } }
  - name: SHOTLYST_LOG_FORMAT
    value: json
livenessProbe:  { httpGet: { path: /healthz, port: http }, periodSeconds: 10 }
readinessProbe: { httpGet: { path: /readyz,  port: http }, periodSeconds: 5 }
terminationGracePeriodSeconds: 20   # app drains in-flight requests on SIGTERM
```

Pod labels used by Loki/Prometheus: `app.kubernetes.io/name: shotlyst`,
`app.kubernetes.io/component: <service>`, `app.kubernetes.io/version`.

## 3. Loki queries worth saving (Grafana)

```logql
# All errors across Shotlyst
{app_kubernetes_io_name="shotlyst"} | json | level="ERROR"

# One request across services
{app_kubernetes_io_name="shotlyst"} | json | request_id="…"

# Slow planning requests
{app_kubernetes_io_name="shotlyst", app_kubernetes_io_component="planning"} | json | duration_ms > 500

# Panics and crashloops
{app_kubernetes_io_name="shotlyst"} | json | msg=~"panic recovered|shutting down"
```

## 4. Metrics (`pkg/metrics`, exposed at `/metrics`)

- `http_requests_total{service,route,method,status}`
- `http_request_duration_seconds{service,route}` (histogram)
- `outbound_requests_total{service,target,status}`
- `db_pool_*` from pgx stats
- `sync_mutations_total{result}` (planning)
- `go_*` / `process_*` defaults

Pod annotations for scraping: `prometheus.io/scrape: "true"`,
`prometheus.io/port: "8080"`, `prometheus.io/path: "/metrics"` (or a
`ServiceMonitor` if using the Prometheus Operator — Helm value toggles).

## 5. Alerts (PrometheusRule, optional in Helm)

- `ShotlystPodRestarting`: `increase(kube_pod_container_status_restarts_total{namespace="shotlyst"}[15m]) > 2`
- `ShotlystErrorRate`: `sum(rate(http_requests_total{status=~"5.."}[5m])) by (service) / sum(rate(http_requests_total[5m])) by (service) > 0.05`
- `ShotlystDependencyDown`: readiness failing for > 2 min (`kube_pod_status_ready == 0`).

## 6. Failure walkthrough (what you should see)

Example: `gear` is down while opening a project.

1. `planning` logs `WARN msg="dependency unavailable" dependency=gear request_id=abc`.
2. `planning` returns the snapshot with `derived.warnings=["gear_unavailable"]` and logs `INFO request completed status=200`.
3. `gear` pod shows `ERROR` lines (or is in CrashLoopBackOff → alert fires).
4. Grafana: filter `request_id=abc` → both lines, one story.
