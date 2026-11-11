# Shotlyst

A private, invite-only web app for film pre-production. One Next.js project on
Vercel, Supabase as the only backend. The plan is in [docs/PLAN.md](docs/PLAN.md),
progress per phase in [docs/CHANGELOG.md](docs/CHANGELOG.md), and the working
rules in [CLAUDE.md](CLAUDE.md).

## Local development

Requirements: Node 22+, pnpm, the Supabase CLI and a Docker-compatible
container runtime.

```sh
pnpm install
supabase start                # local stack; API on :55321, mail on :55324
cp .env.example .env.local    # fill the keys from `supabase status -o env`
pnpm dev                      # http://localhost:3000
```

`supabase db reset` re-applies the migrations and the seed: three users
(`owner@`, `editor@`, `viewer@shotlyst.test`, password `shotlyst-demo-1`) and
two projects. Emails sent by the local stack (invitations, password resets)
appear at http://127.0.0.1:55324.

With Podman instead of Docker, point the CLI at the Podman socket first:

```sh
export DOCKER_HOST="unix://$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')"
```

## Checks

```sh
pnpm lint && pnpm typecheck && pnpm test   # before every commit
pnpm test:rls                              # RLS coverage check + pgTAP tests
pnpm e2e                                   # Playwright; needs `supabase start` and a fresh `supabase db reset`
pnpm db:types                              # after every migration
```

## Deployment

See "Deployment on Vercel and Supabase setup" in the plan and the environment
variable list in the changelog entry for phase 1.
