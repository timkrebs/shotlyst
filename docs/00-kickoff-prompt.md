# Kickoff prompt for Claude Code

Copy this into Claude Code when starting in the `shotlyst/` directory.

---

You are implementing Shotlyst, a shoot-planning web app built as small Go
microservices + a React PWA, deployed with Helm to a single-node Kubernetes
homelab. Read `CLAUDE.md` first, then `docs/01` through `docs/09` in order
(`02`, `06`, `08` and `09` matter most). The docs are the spec; follow them.
Principles in priority order: simple, DRY (shared code lives in `pkg/`
once), observable (JSON logs with pod fields, per
`docs/08-observability.md`). Comment every package and exported symbol with
the *why*, following `docs/09-code-style-examples.md`. Where the spec is silent, choose the simplest option that keeps
the data model and API contract intact, and leave a `// TODO(spec):` note.

Work through `docs/06-implementation-plan.md` starting at **Milestone 0**.
For each task:

1. Implement it with tests.
2. Run `make lint test`.
3. Update `api/<service>.yaml` if the API changed and regenerate the client.
4. Tick the checkbox in the plan and commit with the `<area>: <summary>`
   format.

Stop and ask me before: changing the stack, changing an enum, changing the
sync protocol, adding a large dependency, or adding an external service.
Otherwise keep going until the milestone's acceptance criteria are met,
then summarise what works, what's untested, and what you'd do next.

Start with Milestone 0 now: build `pkg/` first, then the `sun` service as
the template every other service copies, then `identity`, then the Helm
chart and CI, and finish by deploying to the cluster and confirming the
startup log lines show up in Loki with pod name, namespace and node.

---

## Suggested session plan

| Session | Scope |
|---|---|
| 1 | M0: `pkg/` (config, logx, httpx, metrics, dbx, authx, clientx, app) + `sun` service |
| 2 | M0: `identity`, Dockerfile/Compose, Helm chart, CI, first cluster deploy, Loki check |
| 3 | M1: `gear` + `media`, frontend shell + gear pages |
| 4 | M2: planning schema, domain rules, clients with degraded mode, handlers, snapshot |
| 5 | M2: planning frontend (beats & shots, editor, shoot days, sun strip) |
| 6 | M3 export + M4 PWA/IndexedDB/shoot-mode UI |
| 7 | M4 sync + Playwright offline test; M5 polish, dashboard, release 0.1 |

## Things to verify yourself after each session

- Open the app on your phone (same network) and try the flow by hand.
- Run the Loki queries from `docs/08` §3 in Grafana; kill a pod and watch
  the `shutting down` → `starting` lines with the new pod name.
- After M4: real airplane-mode test on a hike or at least a walk.
- Check `docs/06` checkboxes match reality.
