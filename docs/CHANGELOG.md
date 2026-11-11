# Changelog

One entry per phase: what was built, what is open, which assumptions were made.

## Phase 2 — Ideation (11 November 2026)

### Built

- **Database.** One migration with nine tables: `concept_folders`,
  `concepts`, `concept_beats`, `beat_items`, `moodboards`, `moodboard_nodes`,
  `moodboard_edges`, `task_sections`, `tasks`. All carry `project_id`; child
  tables take it from their parent in a trigger. Reads need `can_read`,
  writes `can_edit`. Triggers keep references inside one project and one
  board, stop rows from moving between projects, and set or clear
  `tasks.completed_at` from the column a task sits in.
- **New-project defaults.** A trigger gives every new project an empty
  active concept, a moodboard and the four task columns. The migration adds
  the same to the projects that already exist.
- **Concepts.** Several per project in folders, type treatment, brief or
  note, exactly one active (`set_active_concept()` switches in one
  transaction). Editor with headings, lists, to-dos, quotes, tables, images
  and embedded PDFs; changes save continuously. Images and PDFs are stored
  as file references and get a fresh signed URL each time they render.
- **Beats.** A rail beside the text with start and end per beat, bars over
  the total length, overlaps and gaps flagged, and open items with
  checkboxes under each beat. The logic is the pure, tested
  `analyzeBeats()` in `src/lib/concepts/beats.ts`.
- **Moodboard.** Infinite canvas with zoom and pan; images, sticky notes,
  text, colour swatches, link cards and groups; connector lines with
  optional label and arrowhead; multi-select, align, z-order, duplicate,
  undo and redo (50 steps); a five-colour palette from an image; PNG export
  of the selection or the board; several boards per project. Images arrive
  by upload, drag and drop, paste or from the file library, go straight to
  storage and show as 640 px previews. Changes are saved as diffs in
  batches every 500 ms.
- **Tasks.** Board with the columns Open, In progress, Review and Done
  (renamable), drag and drop within and between columns, and a list view
  sortable by due date and filterable by assignee. A task has title,
  description, assignee, priority, labels, due date and subtasks. The
  assignee can complete their own task as a commenter through
  `set_task_completed()`.
- **Home.** `/` shows the member's open tasks due today or overdue, with
  the project name, and the recently edited projects.
- **Ordering.** `src/lib/position.ts` generates fractional keys, so a move
  writes one row. `position` columns use collation "C".
- **Tests.** 47 unit tests, 839 pgTAP assertions over all 19 tables, 15
  Playwright tests.

### Acceptance

| Criterion | Status |
| --- | --- |
| A concept with image and table survives a reload | Passes (e2e) |
| A board with 200 images stays usable | Passes (e2e): all 200 render, and a 30-step drag of one image finishes well inside the 3-second budget and is saved |
| A card moved to Done sets `completed_at` | Passes (e2e, checked in the database; moving it back clears it) |

### Open

- **Hosted database.** The phase 2 migration is applied locally only. Run
  `supabase db push --remote` before merging the branch.
- **"Turn beats into segments"** needs the `segments` table and comes with
  phase 3.
- **Notifications.** Assigning a task does not notify yet; the
  `notifications` table and the bell arrive in phase 4, together with
  comment threads on tasks.
- **Home** has no upcoming shoot days (phase 5) and no unread notifications
  (phase 4) yet.
- **Tasks** have no link to a shoot day yet (phase 5).
- **Moodboard.** No live cursors (phase 4) and no board per creative
  (phase 3). No free drawing, as planned.
- **Concept co-editing.** `concepts.ydoc` is not created yet; phase 4 adds
  it. Until then two people editing the same concept overwrite each other.

### Assumptions and deviations

- **Due dates are calendar days stored as the end of that day in UTC.**
  "Due today" and "overdue" on Home follow UTC, not the project time zone.
- **`concepts.status`** has the values `draft` and `final`; the plan names
  the column without values.
- **The active concept cannot be deleted.** Another one has to be set active
  first, so a project never ends up without one.
- **A file placed on a moodboard cannot be deleted** from the file library
  until it is removed from the board.
- **Moodboard previews are made in the browser** (a 640 px WebP next to the
  original), because image transformation in Supabase Storage is a paid
  feature.
- **Autosave and the activity log.** The concept editor and the moodboard
  log one "edited" entry per editing session, not one per save.
- **A drag that ends within half a second of closing the tab can be lost
  on the moodboard**, the cost of saving in batches.
- **`tasks.shoot_day_id` is left out** until shoot days exist (phase 5).
- **Dependencies added** (all MIT): `@tiptap/core`, `@tiptap/react`,
  `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-table`,
  `@tiptap/extension-list`, `@tiptap/extensions` (concept editor),
  `@xyflow/react` (moodboard canvas), `@dnd-kit/core`, `@dnd-kit/sortable`,
  `@dnd-kit/utilities` (task board), `html-to-image` (PNG export).
  The ordering keys are implemented in the repo because the usual package
  for them is CC0-licensed, which the rules do not allow.

## Phase 1 — Foundation (11 November 2026)

### Built

- **Scaffold.** Next.js 16 (App Router, TypeScript strict), Tailwind CSS 4,
  shadcn/ui on Radix, lucide icons, light and dark mode. All UI copy in
  `src/messages/en.ts`. The earlier Go and Kubernetes tree was removed; it
  stays in git history.
- **Database.** One migration with ten tables: `profiles`, `app_settings`,
  `brands`, `clients`, `projects`, `project_members`, `invitations`, `files`,
  `activity_log`, `login_attempts`. RLS on every table, the five helper
  functions in the `private` schema, the private `media` bucket with storage
  policies on the first path segment. The anonymous role has no table
  privileges.
- **Sign-in.** Email and password, public sign-up off. `src/proxy.ts`
  refreshes the session on every request and redirects to `/login`; exempt are
  `/login`, `/accept-invite`, `/reset-password`, `/share/*` and `/api/cron/*`.
  Password reset by emailed link. Five failed sign-ins per IP lock sign-in
  for 15 minutes. `X-Robots-Tag: noindex` on every response.
- **Owner bootstrap.** The account whose email equals `OWNER_EMAIL` becomes
  owner on first login, and only while the workspace has no profile at all.
- **Invitations.** Owner or admin invites by email with a workspace role and
  optionally a project with a project role. The row stores a SHA-256 token
  hash and a 7-day expiry; `accept_invitation()` creates the profile, applies
  the roles and marks the invitation accepted in one transaction. Resend and
  revoke for pending invitations.
- **Members and roles.** Settings → Members with role, last sign-in and
  project count; role change, deactivate and reactivate (also bans the auth
  user), ownership transfer. Project members dialog: add an existing member,
  change roles, remove. `usePermissions(projectId)` hides what a role cannot
  do; guards in `src/lib/permissions/` and RLS enforce it.
- **Projects.** Grid with cover, number, client and member avatars; archive
  filter; create with name, type, client, brand, aspect ratio, time zone and
  a suggested number (`2026-001`); overview with details, members and recent
  activity; edit, archive, delete. A project the caller cannot read is a 404.
- **Library.** Brands and clients as searchable tables with create, edit and
  delete.
- **Files.** File library per project: multi-upload and drag and drop
  straight from the browser to storage, images downsized to 2,560 px, simple
  folders, preview for images, PDFs and videos through signed URLs, project
  cover. Profile picture upload under `library/avatars/`.
- **Settings.** Profile (name, picture, colour) and workspace default time
  zone.
- **Activity log.** Every Server Action writes an `activity_log` row.
- **Cron.** `/api/cron/keepalive`, protected by `CRON_SECRET`, scheduled
  daily in `vercel.json`.
- **Tests and CI.** 24 unit tests (Vitest), 422 pgTAP assertions over every
  table, the storage policies and the RPC functions with the actors editor,
  viewer, outsider and anonymous (plus owner, admin, commenter, deactivated),
  7 Playwright tests for the core flows. `scripts/check-rls-tests.mjs` fails
  when a table has no test file. GitHub Actions runs all of it against local
  Supabase.

### Acceptance

| Criterion | Status |
| --- | --- |
| Without a session every route redirects to `/login` | Passes (e2e) |
| An invited user sets a password and sees only the projects they were added to | Passes (e2e, against the local mail catcher) |
| RLS tests pass for editor, viewer, outsider and anonymous | Passes (`pnpm test:rls`) |
| Upload and preview work on the Vercel URL | Passes locally (e2e). **Not yet verified on Vercel**: the app is deployed at `https://shotlyst-1txb.vercel.app`, but the hosted database has no schema yet, so nobody can sign in there. |

### Open

- **Deployment.** Done: GitHub repository, Vercel project with the Supabase
  integration and all seven variables, a green CI run, a production
  deployment that serves `/login` and redirects everything else. Still to
  do: apply the migration to the hosted database (`supabase login`,
  `supabase link`, `supabase db push`), the dashboard settings in the table
  below, SMTP, and the backup GitHub Action (step 10 of the plan).
- **Email templates on the hosted project.** The invitation and recovery
  templates in `supabase/templates/` must also be set in the hosted project
  (dashboard or `supabase config push`). They link to the app with a token
  hash instead of Supabase's default confirmation URL.
- **Home.** `/` redirects to `/projects` until tasks arrive in phase 2.
- **Projects.** No list view next to the grid, no duplication (nothing to
  copy yet), no "next shoot day" on the card (phase 5).
- **Library.** No detail pages with "used in" lists yet; they come with
  talents and locations.
- **Files.** "Where is it used" comes with the modules that use files.
- **Optional daily email digest, TOTP.** Later phases, as planned.

### Assumptions and deviations

- **Email provider.** Resend is not available (its free tier is used up
  elsewhere). Auth emails go through another SMTP provider configured in
  Supabase; the code does not depend on which one. The provider for call
  sheets and notifications is decided in phase 9.
- **`vercel.json` pins `"framework": "nextjs"`**, because the Vercel project
  was created before the code existed and had no framework preset.

- **Next.js 16 names middleware "proxy".** The session check lives in
  `src/proxy.ts`; `src/lib/supabase/middleware.ts` keeps its planned name.
- **`/api/cron/*` is exempt from the session redirect**, in addition to the
  routes listed in the plan. It authenticates with `CRON_SECRET`.
- **`login_attempts` is an eleventh table that the data model does not
  list.** The plan asks for a lock after five failures per IP and names no
  storage for it. The key is an HMAC of the IP with the new variable
  `LOGIN_THROTTLE_SECRET`, so nobody can lock out an address through the API.
- **Who may invite.** The plan says both "owner or admin invites" and "an
  editor invites a new person from the project dialog". Phase 1 follows the
  stricter rule: editors add existing members; only owner and admin invite
  new people.
- **Service-role use.** Besides the invitation actions, deactivating a member
  needs the service role to ban the auth user. Both live in
  `src/features/members/actions.ts`, the one feature file the ESLint rule
  allows.
- **Admins change roles, not profiles.** An admin can change a member's
  workspace role and status but not their name, picture or colour.
- **`projects.status`** has the values `planning`, `production`, `post`,
  `done`; the plan names the column without values.
- **`files.project_id` is nullable** for library media (avatars), matching
  the `library/` path rule.
- **Enums** `workspace_role`, `project_role` and `project_kind` are Postgres
  enum types, so the generated TypeScript types are unions.
- **Only the `media` bucket exists.** `review` and `exports` come with the
  phases that use them.
- **TanStack Query is not installed yet.** Phase 1 reads in Server Components
  and has no inline editing; it arrives with the first view that needs it.
- **Dependencies added beyond the scaffold** (all MIT): `@supabase/supabase-js`
  and `@supabase/ssr` (backend), `zod` (input validation), `server-only`
  (keeps server modules out of the client bundle), `next-themes` (dark mode),
  `sonner` (toasts), `radix-ui`, `class-variance-authority`, `cn`,
  `tw-animate-css` and `lucide-react` (shadcn/ui), `vitest` and
  `@playwright/test` (tests).
- **Local Supabase ports are 5532x** instead of the default 5432x, so the
  stack can run next to another local Supabase project.

### Environment variables

Vercel, for Production and Preview:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL from Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The anon (publishable) key |
| `NEXT_PUBLIC_APP_URL` | The production URL, without a trailing slash |
| `SUPABASE_SERVICE_ROLE_KEY` | The service-role (secret) key |
| `OWNER_EMAIL` | The email of the user you create in the Supabase dashboard |
| `LOGIN_THROTTLE_SECRET` | A random string, e.g. `openssl rand -hex 32` |
| `CRON_SECRET` | A random string; Vercel sends it with the cron call |

Not needed until later phases: `ANTHROPIC_API_KEY`, `AI_TEXT_MODEL`,
`AI_IMAGE_PROVIDER`, `AI_IMAGE_API_KEY` (phase 8), `ORS_API_KEY` (phase 5),
and the mail API key and `MAIL_FROM` (phase 9; phase 1 sends mail through
Supabase Auth only).

Supabase (dashboard settings, not environment variables):

| Setting | Value |
| --- | --- |
| Authentication → Sign In / Providers → Allow new users to sign up | Off |
| Authentication → Users | Create your own user (the `OWNER_EMAIL` address) with a long password |
| Authentication → URL Configuration → Site URL | The production URL |
| Authentication → URL Configuration → Redirect URLs | `https://<your-domain>/**` |
| Authentication → Emails → SMTP Settings | Any SMTP provider (for example Brevo: host `smtp-relay.brevo.com`, port `587`, the SMTP login and key from its dashboard) with a sender address the provider has verified |
| Authentication → Emails → Templates → Invite user | Content of `supabase/templates/invite.html` |
| Authentication → Emails → Templates → Reset password | Content of `supabase/templates/recovery.html` |
| Authentication → Policies → Minimum password length | 10 |
