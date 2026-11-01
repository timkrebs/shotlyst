# Shotlyst — Requirements (PRD)

Status: v1.0 · Owner: Tim Krebs · Last updated: 2026-11-01

## 1. Vision

Shotlyst takes a solo filmmaker or small team from a vague idea to an ordered,
tickable shot list on location — and back into post with a record of what was
actually captured.

One sentence: **"From idea to shot list to shoot day, for people who film
without a crew."**

## 2. Problem

Existing tools fall into two camps:

| Camp | Examples | Why they don't fit |
|---|---|---|
| Crew production suites | StudioBinder, Celtx, SetHero | Built around call sheets, budgets, departments. Heavy for a one-person shoot. |
| Generic boards/notes | Notion, Milanote, Apple Notes, Shot Lister | No structure for shots (size, lens, fps), no on-location mode, no link to gear or light. |

The gap: a run-and-gun shooter (travel, outdoor, documentary, YouTube,
small-brand content) who plans alone, shoots alone or with one helper, and
needs a fast loop of *idea → structure → shots → checklist → review*.

## 3. Personas

**P1 — Solo outdoor filmmaker (primary).**
Films hikes, climbs, travel. Plans the evening before, shoots with a mirrorless
camera and 2–3 lenses, no crew. Needs: quick shot list, offline checklist on
the phone, awareness of light and time, knowing which gear to pack.

**P2 — Small-team content creator.**
Shoots interviews, brand videos, weddings with 1–2 helpers. Needs: share the
plan, assign shots, track what's done, reuse templates per job type.

**P3 — Student / hobby narrative filmmaker.**
Short films with friends. Needs: scene/beat structure, coverage planning,
simple storyboard references.

MVP targets **P1**. P2 drives Phase 3 (sharing/collaboration). P3 is served
incidentally.

## 4. Goals and non-goals

### Goals
- G1. A user can go from an empty project to a usable shot list in under 15 minutes.
- G2. The shot list is usable on a phone, offline, on location, with one thumb.
- G3. Gear-aware: the plan knows the user's camera and lenses and derives
  equivalents, card/battery needs.
- G4. Light-aware: the plan knows when golden hour / sunset is at the location
  and date.
- G5. Self-hostable on a small Kubernetes cluster; one Helm release, Docker Compose for local dev.
- G6. Small, readable services: one bounded context per service, shared library for everything cross-cutting, comments on every module.

### Non-goals (explicitly out of scope)
- Budgeting, payroll, contracts, call sheets with crew departments.
- Video editing, transcoding, media management (separate product idea).
- Real-time multi-user editing (CRDTs). Phase 3 sharing is comment/assign,
  not Google-Docs-style co-editing.
- Native iOS/Android apps in MVP. The PWA must be good enough; native only if
  PWA limits are hit (camera/GPS integration).

## 5. User stories

Format: *As a <persona>, I want <capability> so that <benefit>.* Priority:
P0 = MVP must-have, P1 = MVP should-have, P2 = later.

### Projects
- US-01 (P0) As P1, I want to create a project with a title, logline, and
  shoot date(s), so that all planning lives in one place.
- US-02 (P0) As P1, I want to see all my projects with status (planning /
  shooting / done), so that I can find current work quickly.
- US-03 (P1) As P1, I want to duplicate a project or create one from a
  template, so that recurring formats (hiking vlog) are fast to set up.

### Beats (structure)
- US-10 (P0) As P1, I want to add ordered beats (e.g., Intro, Ascent, Summit,
  Descent) with an intent line and target duration, so that the film has a
  skeleton before I think about shots.
- US-11 (P0) As P1, I want to reorder beats by drag-and-drop.
- US-12 (P1) As P1, I want to attach a location and a time-of-day target to a
  beat, so that scheduling and light planning can use it.

### Shots
- US-20 (P0) As P1, I want to add shots to a beat with structured fields:
  shot size, movement, lens, focal length, frame rate, audio need, priority,
  description, so that the list is consistent and filterable.
- US-21 (P0) As P1, I want to reorder shots within and across beats.
- US-22 (P0) As P1, I want to see totals: number of shots, must-have count,
  estimated time, lenses required, so that I know what to pack and how long
  the day is.
- US-23 (P1) As P1, I want to attach a reference image or URL to a shot, so
  that I remember the framing I had in mind.
- US-24 (P1) As P1, I want to duplicate a shot, so that coverage variants
  (WS/MS/CU of the same action) are fast to add.
- US-25 (P2) As P1, I want to tag shots freely (e.g., "drone", "b-roll").

### Gear
- US-30 (P0) As P1, I want to store my cameras (sensor format, crop factor,
  codecs/bitrates) and lenses (focal range, aperture, mount), so that shots
  can reference real gear.
- US-31 (P0) As P1, I want shots to display full-frame-equivalent focal
  length for the chosen camera, so that an APS-C body and FF lenses don't
  confuse me.
- US-32 (P1) As P1, I want to see estimated record time per memory card and
  estimated battery count for a shoot day, based on codec and shot durations.
- US-33 (P1) As P1, I want a packing list derived from the shot list (lenses,
  cards, batteries, audio gear), so that I don't forget gear.

### Shoot mode (on location)
- US-40 (P0) As P1, I want a mobile view that lists shots as a large tappable
  checklist, ordered by shoot order (not story order), so that I can work with
  one thumb and gloves.
- US-41 (P0) As P1, I want shoot mode to work fully offline and sync when
  back online, so that no signal on the mountain is not a problem.
- US-42 (P0) As P1, I want to mark a shot as done / needs redo / skipped and
  add a short note or voice memo, so that post knows what happened.
- US-43 (P1) As P1, I want to add an unplanned shot quickly in shoot mode, so
  that spontaneous shots are captured in the record.
- US-44 (P1) As P1, I want to see sunrise / golden hour / sunset for the
  project location and date at the top of shoot mode.

### Light and schedule
- US-50 (P1) As P1, I want the project to resolve a location (map pin or
  search) and show sun times for the shoot date.
- US-51 (P2) As P1, I want beats with a time-of-day target to be warned when
  they conflict with available light.
- US-52 (P2) As P1, I want a simple shoot-day timeline (start, beats, travel
  gaps) to sanity-check the day.

### Idea exploration
- US-60 (P1) As P1, I want an idea board per project (free-form notes,
  images, links) that I can later promote into beats or shots, so that early
  thinking isn't lost.
- US-61 (P2) As P1, I want AI to propose a draft beat/shot list from the
  logline + location + gear, so that I start from a draft instead of a blank
  page.
- US-62 (P2) As P1, I want AI to review my shot list for missing coverage
  (no establishing shot, no cutaways, no audio plan), so that I catch gaps
  before the shoot.

### Post handoff
- US-70 (P1) As P1, I want to export the shot list (CSV, Markdown, PDF), so
  that I can print it or hand it to a collaborator.
- US-71 (P2) As P1, I want to import camera clip metadata (Sony XML sidecars)
  and match clips to planned shots, so that the plan becomes a record.

### Sharing and collaboration
- US-80 (P2) As P2, I want a read-only share link with optional comments,
  so that a client or helper can review without an account.
- US-81 (P2) As P2, I want to assign shots to a team member.

### Account
- US-90 (P0) As P1, I want to sign up / log in with email and password, so
  that my data is private.
- US-91 (P2) As P1, I want to export all my data as JSON.

## 6. Functional requirements (MVP = Phase 1)

| ID | Requirement |
|---|---|
| FR-1 | CRUD for Projects, Beats, Shots, Cameras, Lenses. |
| FR-2 | Beats and Shots have explicit `position` ordering; reorder is a single atomic API call. |
| FR-3 | Shot fields are enumerated where sensible (shot size, movement, frame rate, priority, audio need, status). Enum values are defined in `docs/03-data-model.md` and are the single source of truth. |
| FR-4 | Shot has both `story_order` (via beat position + shot position) and an optional `shoot_order` integer for shoot mode. |
| FR-5 | Derived values (equivalent focal length, estimated time, lens set) are computed server-side and returned with the shot list; the client never duplicates the rules. |
| FR-6 | Shoot mode: all project data for a project is cacheable offline; mutations (status, note, new shot) are queued and replayed in order with idempotency keys. |
| FR-11 | Service boundaries: identity, gear, planning, sun, media, export (Phase 3: ai). Each owns its data; cross-service reads go through HTTP clients in `pkg/clientx`; a dependency outage degrades (derived values null + warning) rather than fails the request. |
| FR-7 | Sun times: given lat/lon/date, compute sunrise, sunset, civil twilight, golden hour windows. Computed locally (no external API) using a standard solar algorithm. |
| FR-8 | Export shot list as CSV and Markdown. |
| FR-9 | Authentication: email + password, session cookie, bcrypt/argon2id hashing. Single-tenant per user; all data scoped by `user_id`. |
| FR-10 | Reference images: upload to object storage (S3-compatible), max 10 MB, image types only; thumbnails generated server-side. |

## 7. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | Mobile-first UI. Shoot mode must be usable at 375 px width with touch targets ≥ 44 px. |
| NFR-2 | Offline: shoot mode works with no network after first load of the project. PWA with service worker; IndexedDB for data and mutation queue. |
| NFR-3 | Performance: shot list with 200 shots renders in < 200 ms on a mid-range phone; API p95 < 150 ms for list endpoints. |
| NFR-4 | Self-hosting: `docker compose up` brings up the full stack locally. A Helm chart deploys all services to the owner's Kubernetes homelab from Milestone 0 on (see `docs/07-deployment.md`). |
| NFR-5 | Data ownership: full JSON export; no third-party analytics by default. |
| NFR-6 | Security: all endpoints authenticated except auth and share-link views; CSRF protection on cookie sessions; rate limiting on auth endpoints. |
| NFR-10 | Observability: every service emits structured JSON logs with pod metadata and request IDs to stdout, exposes `/metrics`, `/healthz`, `/readyz` (see `docs/08-observability.md`). A failure must be diagnosable from Loki/Grafana alone. |
| NFR-11 | Simplicity & DRY: shared concerns (logging, auth, errors, DB, HTTP server, clients) are implemented once in `pkg/`; every package and exported symbol has a doc comment explaining its purpose. |
| NFR-7 | Testing: backend unit tests for derived-value rules and sun calculations; API integration tests against a real Postgres (testcontainers or docker); frontend component tests for shoot mode; one end-to-end smoke test (Playwright). |
| NFR-8 | i18n-ready: all UI strings in a message catalog; English only in MVP, German second. |
| NFR-9 | Accessibility: keyboard-navigable lists on desktop; sufficient contrast in a dark theme (shoot mode defaults to dark). |

## 8. Phases

- **Phase 1 — MVP (P0 stories):** auth, projects, beats, shots, gear, derived
  values, shoot mode offline, CSV/Markdown export, sun times.
- **Phase 2 — Planning depth (P1):** idea board, references, packing list,
  card/battery estimates, templates, light warnings, Helm chart, German UI.
- **Phase 3 — AI and collaboration (P2):** AI draft and coverage review,
  share links with comments, assignments, Sony XML import, PDF export.

Detailed task breakdown in `docs/06-implementation-plan.md`.

## 9. Success metrics (for the owner, not analytics)

- Time from new project to first exported shot list: < 15 min.
- Shoot mode used on ≥ 3 real shoots without falling back to Apple Notes.
- Zero data loss across offline/online transitions on those shoots.

## 10. Open questions

- OQ-1: Should Phase 1 include a minimal idea board (notes only) since it's
  cheap, or stay strictly structural? Default: ship notes-only board in Phase 1
  if it fits; otherwise Phase 2.
- OQ-2: Voice memos in shoot mode — store audio in object storage (simple) or
  transcribe on upload (needs Whisper service)? Default: store only in MVP.
- OQ-3: Multi-user per project in Phase 3 — invite by email, or share-link
  only? Default: share-link first.
