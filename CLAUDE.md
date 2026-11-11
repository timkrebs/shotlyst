# CLAUDE.md — Shotlyst

Shotlyst is a private, invite-only web app for film pre-production: one
Next.js project on Vercel with Supabase as its only backend. `docs/PLAN.md`
is the spec; `docs/CHANGELOG.md` records what each phase built, what is open
and which assumptions were made. Read both before writing code.

## Rules

1. Implement only the current phase from `docs/PLAN.md`. Do not pull features
   forward from later phases.
2. English only: UI copy, identifiers, comments, commit messages, docs. UI
   copy lives in `src/messages/en.ts`, never inline.
3. Every schema change is a migration under `supabase/migrations/`. Every new
   table gets RLS, its policies and its `project_id` trigger in the same
   migration.
4. Every new table gets an RLS test in `supabase/tests/` in the same pull
   request. A table without a test fails CI.
5. Regenerate `src/lib/db.types.ts` after each migration. No `any`, no
   hand-written table types.
6. Write only through Server Actions in `src/features/*/actions.ts`. Each
   validates input with Zod, checks the role with a guard from
   `src/lib/permissions/` and writes an `activity_log` row.
7. `src/lib/supabase/admin.ts` (service role) may be imported only by
   `src/app/share/`, `src/app/api/share/`, `src/app/api/cron/` and the
   invitation actions in `src/features/members/actions.ts`. An ESLint rule
   enforces it.
8. Never store derived values. Time logic lives only in `src/lib/schedule/`
   and `src/lib/dood/`, with a unit test for every case.
9. Do not use the name, copy, icons or images of the reference product named
   in `docs/PLAN.md` anywhere. Write all UI copy yourself.
10. No new dependency without a reason in the commit message. Check the
    licence: MIT, Apache-2.0, BSD or ISC only.
11. Before each commit: `pnpm lint`, `pnpm typecheck`, `pnpm test`. At the end
    of each phase also `pnpm test:rls` and `pnpm e2e`.
12. Each phase ends with an entry in `docs/CHANGELOG.md`: what was built, what
    is open, which assumptions were made.
13. Never mention the reference product in any part of the project outside
    `docs/PLAN.md`: not in code, comments, UI copy, commits or other docs.
14. Never mention AI authorship ("authored by Claude" or anything similar) in
    any part of the project, in commits or pull requests, or in documentation.
    No co-author trailers.

## Commands

```
pnpm dev            # Next.js dev server
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit
pnpm test           # Vitest unit tests
pnpm test:rls       # RLS coverage check + pgTAP tests against local Supabase
pnpm e2e            # Playwright against local Supabase
pnpm db:types       # regenerate src/lib/db.types.ts
supabase start      # local stack (needs a Docker-compatible runtime)
supabase db reset   # re-apply migrations and seed.sql
```

## Architecture rules

- Read in Server Components, write in Server Actions. Route Handlers only for
  PDF, CSV, AI streaming, cron and public token links.
- Files go from the browser straight to Supabase Storage, never through a
  Vercel Function.
- Every project-scoped table carries `project_id`, so each RLS policy is one
  helper call (`private.can_read`, `private.can_comment`, `private.can_edit`).
- Access is decided in Postgres. The UI hides what a role cannot do through
  `usePermissions`, but Server Actions and RLS enforce it regardless.
- Derived values are computed, never stored. Ordering uses a fractional index
  in `position`.
- Session handling lives in `src/proxy.ts` (the Next.js 16 name for
  middleware) and `src/lib/supabase/middleware.ts`.

## Layout

```
docs/                  PLAN.md, CHANGELOG.md
supabase/migrations/   one SQL file per phase, including RLS policies
supabase/tests/        pgTAP RLS tests: editor, viewer, outsider, anonymous
supabase/seed.sql      demo workspace
src/app/               routes: (auth), (app), share, api
src/features/<name>/   components, actions.ts, queries.ts, schema.ts
src/lib/               supabase, permissions, and pure domain logic
src/components/ui/     shadcn
src/messages/en.ts     all UI copy
e2e/                   Playwright
```

## Git

- One branch and pull request per phase (`phase-N`), small green commits.
- Commit message: `<area>: <imperative summary>`.
