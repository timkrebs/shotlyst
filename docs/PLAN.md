# Shotlyst: project plan

Nov 10, 2026 · @Tim

## Goal and scope

Shotlyst is a private, invite-only web app for film pre-production. It covers the Tillyboard feature set (concept, moodboard, shot list with storyboard, scheduling, call sheets, crew and cast, locations, equipment, tasks, budget, review, exports) and adds three feature-film tools Tillyboard does not offer: script breakdown, stripboard and day-out-of-days. It runs on Vercel, stores everything in Supabase, and nothing is reachable without a login.

**What “1:1” means in this plan.** Shotlyst takes over the modules, the workflows and the core principle: every shot exists once and feeds storyboard, schedule and call sheet. It does not take over Tillyboard's name, logo, copy, icons, illustrations, code or pixel-level screen design. Shotlyst gets its own UI built on shadcn/ui. That holds for private use too, and it keeps the project clean once friends join.

**Who uses it.** You own the workspace. Friends join by invitation only, per project, with a role. There is no public sign-up.

**Language.** Everything is English: UI copy, code, comments, commit messages, database names and every file under `docs/`. No German strings anywhere in the repository.

**Non-goals**

- Public sign-up, plans, billing, storage quotas
- Several workspaces or organisations; one deployment is one workspace
- Native apps for iPhone, iPad and Apple Watch (an installable PWA instead)
- Company crew administration: time tracking, absences, overtime, contracts, equipment rental
- Screenwriting; scripts are imported, not written here
- Import or export of Movie Magic or Tillyboard project files

## Assumptions and open decisions

The plan rests on twelve assumptions; confirm or change them before phase 1 starts. The access model is the one that is hardest to change later.

| Topic | Assumption in this plan | Alternative |
| --- | --- | --- |
| Login | Supabase Auth with email and password. Public sign-up is off; accounts exist only through an invitation. | Magic-link login without passwords. |
| Access model | One workspace. Workspace roles: owner, admin, member. Project roles: editor, commenter, viewer. A member sees only the projects they were added to. | Flat model: every invited person sees and edits everything. Much less RLS work, no privacy between projects. |
| Shared library | Every member can read talents, locations, crew and equipment and add entries. Only owner and admin delete. | Library visible to owner and admin only; members pick from names. |
| Money | The budget module is visible to owner, admin and project editors. Day-rate columns in the library are not hidden from members. | Move rates into separate admin-only tables. |
| Live collaboration | Supabase Realtime for presence, cursors and live data. The concept editor is co-edited through Yjs. | A soft lock on concept documents (“Anna is editing”) instead of co-editing. |
| Project type | Each project is `short_form` (shot-based) or `narrative` (script-based). Narrative projects add script, breakdown, stripboard and day-out-of-days and keep every other module. | Show all modules in every project. |
| Script import | Fountain and Final Draft (`.fdx`). No PDF import, because PDF parsing is unreliable. | AI-assisted PDF import as a later phase. |
| AI for text | Claude through the Anthropic API, model ID in an environment variable. | Another provider behind the same interface (Vercel AI SDK). |
| AI for images | Provider behind an interface, choice still open. Monthly limit per workspace. | No AI images; frames by upload only. |
| External links | Call-sheet confirmation, client review and a read-only guest link work through token links without an account. | Require an account for everyone. |
| Email | Resend, both as SMTP for Supabase invitations and for call sheets. Invitations make email mandatory. | Copy invitation links by hand. |
| Earlier Shotlyst spec | This plan supersedes the earlier Shotlyst architecture (Go microservices on Kubernetes): one Next.js app on Vercel, Supabase as the backend. | Keep the homelab as a second deployment target with a Dockerfile. |

## Feature scope

Of 38 feature areas, 28 match the reference product, 3 are adapted, 4 go beyond it and 3 are dropped. The Phase column points to the implementation phases below. The reference column is based on Tillyboard's public product pages and API reference; see Sources.

| Area | Scope of the reference product | In Shotlyst | Phase |
| --- | --- | --- | --- |
| Projects | Projects with number, aspect ratio, time zone, client, brand | Same, plus a project type | 1 |
| Brand context | Tone, audience and no-gos per brand, used by the AI | Same; the brand feeds every AI prompt | 1, 8 |
| Files | Image and PDF uploads | File library per project | 1 |
| Members and roles | Workspace roles from owner to viewer, project invitations | Workspace roles owner, admin, member; project roles editor, commenter, viewer; invitation by email | 1 |
| Concept | Treatment editor, beats with time windows, open items, several concepts, one active | Same | 2 |
| Moodboard | Free canvas with stills, photos, notes, connector lines, named live cursors | Same; cursors arrive in phase 4 | 2, 4 |
| Tasks | Board with Open, In progress, Review, Done; today's tasks on the home page | Same, with assignees | 2 |
| Creatives | Several spots or cutdowns per project | Same | 3 |
| Shot list | One row per shot: action, audio, on-screen text, cast, location, duration, camera fields; custom columns | Same | 3 |
| Segments | Target time per segment, running total green or red | Same | 3 |
| Views | Creatives, timeline and script on the same shots | Same, plus a storyboard grid | 3 |
| Storyboard | One frame per shot from upload, reference or AI | Upload in phase 3, AI in phase 8 | 3, 8 |
| Talents | People and objects with type, languages, residence, day rate | Same, shared across projects | 3 |
| Live collaboration | Several people work in one project at once | Live data on every project view, presence, cursors on moodboard and shot list, co-editing in the concept | 4 |
| Comments and notifications | Comments on shots and tasks, mentions | Same, plus an activity log per project | 4 |
| Locations | Category, address, parking, power, contact, day rate; table or map | Same | 5 |
| Shoot days | One plan per day, blocks movable between days | Same | 5 |
| Schedule | Blocks for shots, moves, breaks, briefings; times recalculate; now-line; check-off | Same | 5 |
| Weather and light | Sunrise, sunset, golden hour, temperature, rain, wind per location | Same, through Open-Meteo and SunCalc | 5 |
| Routes | Travel time and distance for moves | Same, through OpenRouteService | 5 |
| Crew and cast | Department, role, day rate, individual call time per shoot day | Same | 6 |
| Call sheet | A view of the shoot day: times, locations, emergency, run order, cast, crew, notes; PDF | Same | 6 |
| Equipment | Inventory, kits, props, packing lists per shoot day or department, carnet CSV | Same | 6 |
| Double bookings | AI warns when an item is planned twice | Adapted: rule-based SQL check | 6 |
| Budget | Enterprise plan only: production and crew planning, hotels, travel, catering | Adapted: lean planned-versus-actual sheet fed by day rates | 6 |
| Script | Not offered | Fountain and FDX import, scene list, page counts in eighths, draft versions | 7 |
| Script breakdown | Not offered | Tag elements per scene in 14 categories, breakdown sheets, element reports | 7 |
| Stripboard | Not offered | Colour-coded scene strips, day breaks, boneyard, sorting, page totals per day | 7 |
| Day-out-of-days | Not offered | Computed report per cast member and element with start, work, hold and finish codes | 7 |
| AI assistant | Concept proposal, summary, shot images, single-shot regeneration, @ mentions, film vocabulary | Same with own prompts, plus breakdown suggestions | 8 |
| Sending and confirmation | Call sheet by email, confirmation through a link without an account | Same, through token links | 9 |
| Review | Comments at a timecode, drawing on the frame, approval, download | Same, through token links | 9 |
| Guest link | Public read-only link to a project | Same, limited to shot list, storyboard and schedule | 9 |
| Exports | PDF for call sheet, schedule, concept, shot list, packing list; CSV; images; project ZIP | Same with own logo, plus stripboard, breakdown and day-out-of-days | 3 to 10 |
| Devices and offline | Browser, iPad, iPhone, Watch; packing list offline | Adapted: responsive PWA with an offline set mode, no Watch app | 10 |
| REST API and Claude connector | API on the Enterprise plan, connector announced | Dropped; an MCP server would be a later extension | – |
| Company crew administration | Time tracking, absences, overtime, contracts, rental | Dropped | – |
| Plans and billing | Paid plans with storage and AI quotas | Dropped | – |

## Tech stack and architecture

Shotlyst is a single Next.js project on Vercel with Supabase as its only backend. There is no server of its own, no queue and no microservices.

&#91;embedded content: Architecture · members and guests, Next.js, Supabase, external services\]

Members reach Next.js with a session cookie and talk to Supabase directly for uploads and live updates. Guests reach exactly one record through a token link. Only the server calls external services.

| Area | Choice | Reason |
| --- | --- | --- |
| Framework | Next.js (current stable release, App Router), TypeScript strict | Native fit for Vercel; Server Components and Server Actions replace a separate API layer |
| UI | Tailwind CSS, shadcn/ui, lucide icons | Own, consistent interface without design overhead |
| Data | Supabase Postgres with Row Level Security, `@supabase/ssr` | Auth, database, storage and realtime from one provider |
| Types | `supabase gen types` plus a Zod schema per form | One type per table, validated input |
| Client cache | TanStack Query with optimistic updates | Fast inline editing; live events patch the same cache |
| Realtime | Supabase Realtime: Presence, Broadcast, Postgres Changes on private channels | Presence, cursors and live data without another service |
| Co-editing | Yjs with Tiptap's collaboration extension and a small provider over a Realtime channel | Conflict-free concept editing without a collaboration server |
| Tables | TanStack Table | Shot list with configurable columns |
| Drag and drop | dnd-kit | Shots, blocks, strips, task cards |
| Editor | Tiptap | Headings, lists, to-dos, quotes, tables, images |
| Canvas | React Flow (`@xyflow/react`) | Nodes and connector lines, MIT licence. tldraw draws more freely but needs a licence key |
| Script parsing | A Fountain parser and `fast-xml-parser` for FDX, both behind `lib/script/parse.ts` | Two import formats, one scene model |
| PDF | `@react-pdf/renderer` in Route Handlers | Layouts as React components, runs serverless |
| Map | MapLibre GL with OpenStreetMap tiles | Free, no Google account |
| Geodata | Photon for geocoding, OpenRouteService for routes, Overpass for the nearest hospital | Free services; OpenRouteService needs a free key |
| Weather | Open-Meteo, SunCalc for golden hour | No key needed |
| AI | Vercel AI SDK; text through Anthropic, images through a provider interface | Providers stay swappable |
| Email | Resend with React Email templates | Invitations, call sheets, notifications |
| Offline | Serwist service worker, IndexedDB | Set mode without a connection |
| Tests | Vitest for logic, RLS tests against local Supabase, Playwright for core flows | Time maths, permissions and login must be right |

**Architecture rules**

- Read in Server Components, write in Server Actions. Route Handlers only for PDF, CSV, AI streaming, cron and public token links.
- Files go from the browser straight to Supabase Storage. Vercel Functions accept at most 4.5 MB per request.
- Every project-scoped table carries `project_id`, so each RLS policy is one function call and each live subscription one filter.
- One private Realtime channel per project, `project:{id}`. Clients never write through Realtime; they write through Server Actions and receive the change as an event.
- The service-role key is used only in Route Handlers for token links and in the invitation action, never in client code.
- Derived values such as block times, segment totals, wrap time and day-out-of-days codes are computed, never stored.
- Ordering uses a fractional index in `position`, so a move changes one row.

## Access, roles and security

Nothing is reachable without a session, and what a signed-in member can see or change is decided in Postgres, not in the UI. Protection sits on four layers: routes, database, storage and realtime channels.

**Sign-in and invitations**

1. Public sign-up is switched off in Supabase. You create the first user in the dashboard; the account whose email equals `OWNER_EMAIL` becomes workspace owner on first login.
2. Owner or admin invites by email, from Settings → Members or from a project's Members dialog, and picks the workspace role and optionally a project with a project role.
3. A Server Action stores an `invitations` row with a hashed token and a 7-day expiry, then calls Supabase's admin invite. The email goes out through Resend.
4. The invitee opens the link and sets name and password on `/accept-invite`. One transaction creates the `profiles` row, applies the roles and marks the invitation accepted.
5. `/login` takes email and password; `/reset-password` handles forgotten passwords.
6. Middleware checks and refreshes the session on every request. Exempt are `/login`, `/accept-invite`, `/reset-password`, `/share/*` and static files.
7. Deactivating a member sets `profiles.deactivated_at` and bans the auth user. Their content stays; their access ends with the next token refresh.

**Workspace roles**

| Role | Can do |
| --- | --- |
| Owner | Everything, including members, settings and ownership transfer. Exactly one. |
| Admin | Every project, the whole library, invitations, AI settings. Cannot remove the owner. |
| Member | Only projects they were added to. Reads the library and adds entries. No settings. |

**Project roles**

| Role | Can do |
| --- | --- |
| Editor | Create, change and delete everything in the project, export, generate AI frames, manage project members. |
| Commenter | Read everything, comment, complete tasks assigned to them, check off schedule blocks and packing-list items on set. |
| Viewer | Read and export. |

Owner and admin act as editor in every project. The person who creates a project becomes its editor.

**Database, storage and realtime**

- Row Level Security is on for every table. Policies call five helper functions in a `private` schema, all `security definer` and `stable`: `is_active_member()`, `is_admin()`, `can_read(project_id)`, `can_comment(project_id)`, `can_edit(project_id)`.
- Project tables: `select` needs `can_read`, `insert`, `update` and `delete` need `can_edit`. Comments need `can_comment`; authors edit only their own.
- Library tables: any active member reads and inserts; update by creator or admin; delete by admin.
- `budget_items` is readable only with `can_edit`.
- The two on-set check-offs run through RPC functions that require `can_comment` and touch only `done_at` or `checked_at`.
- Storage buckets are private. Object paths start with the project ID; storage policies run `can_read` and `can_edit` on that first path segment. Files are served through short-lived signed URLs.
- Realtime channels are private. A policy on `realtime.messages` admits a user to `project:{id}` only if `can_read` holds for that ID.
- RLS tests cover every table with four actors: editor, viewer, member of another project, anonymous. They run in CI against local Supabase.

**Public token links**

- `/share/[token]` is the only way in without an account: call-sheet confirmation, client review and the read-only guest link.
- Tokens are 32 random bytes, stored only as a SHA-256 hash, with expiry and revocation.
- The Route Handler validates the token, reads exactly the shared record with the service-role key and returns nothing else.
- Writes through a token are limited to two actions: confirm and comment.

**Hardening**

- `X-Robots-Tag: noindex` on every page, no sitemap.
- Login attempts are limited: Supabase throttles, and five failures per IP lock sign-in for 15 minutes.
- AI, mail and service-role keys exist only in server environment variables.
- The UI hides or disables what a role cannot do through one `usePermissions(projectId)` hook. Server Actions and RLS enforce it regardless.
- Every write is recorded in `activity_log` with actor and time.
- Optional later: TOTP as a second factor through Supabase MFA.

## Data model

The schema has 54 tables in nine groups. Library data is shared across projects; everything else belongs to one project and carries `project_id`. Every table has `id uuid`, `created_at`, `updated_at` and, where people write, `created_by`. Money is stored as cents in `integer`, shot durations in seconds, block durations in minutes, scene length in eighths of a page.

**Workspace and access**

| Table | Purpose | Key fields |
| --- | --- | --- |
| `profiles` | One row per auth user | id (= auth user), display\_name, avatar\_file\_id, color, workspace\_role, deactivated\_at |
| `project_members` | Who is in which project | project\_id, user\_id, role (editor, commenter, viewer), added\_by |
| `invitations` | Pending and accepted invitations | email, workspace\_role, project\_id, project\_role, token\_hash, expires\_at, accepted\_at, invited\_by |
| `comments` | Threads on any record | project\_id, entity\_type, entity\_id, parent\_id, author\_id, body, mentions uuid\[\], resolved\_at |
| `notifications` | Inbox per user | user\_id, project\_id, kind, entity\_type, entity\_id, actor\_id, read\_at |
| `activity_log` | Who changed what | project\_id, actor\_id, action, entity\_type, entity\_id, summary |

**Library and settings (shared across projects)**

| Table | Purpose | Key fields |
| --- | --- | --- |
| `brands` | Brand context for AI | name, description, industry, tone, target\_audience, no\_gos, website |
| `clients` | Clients | name, email, phone, note |
| `talents` | People and objects in front of the camera | name, type, description, birth\_date, languages, residence, contact, daily\_rate\_cents, tags, avatar\_file\_id |
| `locations` | Shooting locations | name, category, description, address, lat, lng, contact\_name, contact\_details, parking, power\_supply, permit\_number, daily\_rate\_cents, max\_crew\_size, parent\_id, nearest\_hospital jsonb |
| `crew_members` | Crew directory | name, email, phone, department, job\_title, daily\_rate\_cents, note, user\_id (set when the person is also a member) |
| `equipment` | Inventory | name, manufacturer, model, category, tags, condition, quantity, serial\_number, internal\_id, storage\_location, container, purchase\_date, purchase\_price\_cents, weight\_g, daily\_rate\_cents, country\_of\_origin, customs\_value\_cents, customs\_tariff\_number, parent\_equipment\_id |
| `kits`, `kit_items` | Fixed sets of equipment | title, notes; kit\_id, equipment\_id, quantity, position |
| `app_settings` | Workspace settings | key, value jsonb (export logo, AI monthly limit, locale, default time zone) |

**Project and concept**

| Table | Purpose | Key fields |
| --- | --- | --- |
| `projects` | Container for everything | name, project\_number, kind (short\_form, narrative), description, brand\_id, client\_id, aspect\_ratio, timezone, budget\_cents, status, cover\_file\_id, position, archived\_at |
| `files` | File library and pointer into storage | project\_id, bucket, path, name, mime, size, width, height, folder, kind |
| `concepts`, `concept_folders` | Treatments and briefs | project\_id, folder\_id, title, type, status, is\_active, ydoc bytea, content jsonb (snapshot), summary |
| `concept_beats` | Beats with a time window | concept\_id, title, description, start\_sec, end\_sec, position |
| `beat_items` | Open items under a beat | beat\_id, label, done, position |
| `moodboards` | Canvas | project\_id, creative\_id, title |
| `moodboard_nodes` | Elements on the canvas | board\_id, type (image, note, text, color, link, group), x, y, width, height, z, data jsonb, file\_id |
| `moodboard_edges` | Connector lines | board\_id, source\_node\_id, target\_node\_id, style jsonb |

**Creative and shot list**

| Table | Purpose | Key fields |
| --- | --- | --- |
| `creatives` | Spot or cutdown | project\_id, title, status, goal, key\_message, audience, aspect\_ratio, must\_haves, no\_gos, position |
| `segments` | Sections with a target time | creative\_id, title, description, target\_duration\_sec, position |
| `shots` | The single source for every shot | project\_id, creative\_id, segment\_id, scene\_id, position, shot\_number, action, audio, on\_screen\_text, script\_text, shot\_size, camera\_movement, camera\_angle, lens, frame\_rate, equipment\_note, int\_ext, day\_night, duration\_sec, setup\_min, status, notes, custom\_values jsonb, active\_frame\_id |
| `shot_talents`, `shot_locations` | Links | shot\_id, talent\_id; shot\_id, location\_id |
| `shot_frames` | Storyboard images with versions | shot\_id, file\_id, source (upload, reference, ai), prompt |
| `shotlist_columns` | Custom columns | project\_id, key, label, type, config jsonb, position, visible |
| `props` | Props | project\_id, creative\_id, title, description, status |

**Script and breakdown (narrative projects)**

| Table | Purpose | Key fields |
| --- | --- | --- |
| `scripts` | One row per imported draft | project\_id, title, version, source\_format (fountain, fdx), source\_file\_id, content jsonb (parsed), is\_current |
| `scenes` | Scenes of the current draft | project\_id, script\_id, scene\_number, int\_ext, set\_name, day\_night, script\_day, eighths, synopsis, est\_minutes, location\_id, position, omitted, needs\_review |
| `characters` | Speaking roles | project\_id, name, cast\_number, talent\_id |
| `breakdown_categories` | Element categories with colours | project\_id, key, label, color, position |
| `breakdown_elements` | One row per distinct element | project\_id, category\_id, name, character\_id, prop\_id, equipment\_id, notes |
| `scene_elements` | Element appears in scene | project\_id, scene\_id, element\_id, quantity, note, text\_ranges jsonb |
| `dood_overrides` | Manual day-out-of-days codes | project\_id, element\_id, date, code (travel, rehearsal, fitting) |

**Scheduling**

| Table | Purpose | Key fields |
| --- | --- | --- |
| `shoot_days` | One plan per day | project\_id, title, date, kind (shoot, travel, rest, prep), general\_call, shooting\_call, lunch\_at, base\_location\_id, notes, is\_draft |
| `schedule_blocks` | Blocks and strips of the day | shoot\_day\_id, type (shot, scene, move, break, briefing, setup, banner, custom), shot\_id, scene\_id, parent\_block\_id, title, duration\_min, position, from\_location\_id, to\_location\_id, distance\_km, route jsonb, notes, done\_at |
| `crew_assignments` | Crew on a shoot day | shoot\_day\_id, crew\_member\_id, role\_label, department, call\_time, wrap\_time, daily\_rate\_cents, status, note |
| `cast_assignments` | Cast on a shoot day | shoot\_day\_id, talent\_id, character\_id, call\_time, makeup\_time, costume\_time, status, note |
| `call_sheets` | Extra details for the day | shoot\_day\_id, production\_office, emergency jsonb, notes jsonb (safety, catering, other), published\_at, pdf\_file\_id |
| `call_sheet_recipients` | Sending and confirmation | call\_sheet\_id, crew\_member\_id, talent\_id, name, email, share\_link\_id, sent\_at, viewed\_at, confirmed\_at |

**Equipment in a project**

| Table | Purpose | Key fields |
| --- | --- | --- |
| `packing_lists` | Packing list per shoot day or department | project\_id, shoot\_day\_id, title, department, notes |
| `packing_list_items` | Line items | list\_id, ref\_type (equipment, kit, prop, free), equipment\_id, kit\_id, prop\_id, label, quantity, notes, checked\_at, checked\_by, position |

**Tasks and budget**

| Table | Purpose | Key fields |
| --- | --- | --- |
| `task_sections` | Board columns | project\_id, name, color, position, is\_done |
| `tasks` | Tasks | project\_id, section\_id, parent\_task\_id, shoot\_day\_id, assignee\_id, title, description, priority, labels, start\_at, due\_at, completed\_at, position |
| `budget_items` | Budget lines | project\_id, category, title, quantity, unit, unit\_price\_cents, actual\_cents, source\_type, source\_id, position |

**Review, sharing and AI**

| Table | Purpose | Key fields |
| --- | --- | --- |
| `review_items` | Cut or still for approval | project\_id, title, file\_id, version, status (in\_review, changes, approved), approved\_at, approved\_by\_name |
| `review_comments` | Comments at a timecode | review\_item\_id, timecode\_ms, body, drawing jsonb, author\_id, author\_name, share\_link\_id, resolved\_at |
| `share_links` | Token links | project\_id, kind (callsheet, review, guest), target\_id, token\_hash, expires\_at, revoked\_at |
| `ai_generations` | Log and quota | project\_id, user\_id, kind (text, image), model, prompt, status, file\_id, error |

**Storage buckets:** `media` for images and files, `review` for videos, `exports` for generated PDFs. All private. Path scheme: `{project_id}/{area}/{uuid}.{ext}`; library media lives under `library/`.

**Delete rules:** Deleting a project removes its children through `on delete cascade`. Library rows are never cascade-deleted; links to them use `on delete restrict`, so no talent disappears from an existing shot list. A deactivated member keeps their `profiles` row, so authorship stays readable.

**Child tables:** rows such as `segments`, `beat_items` or `packing_list_items` also store `project_id`, filled by a trigger from the parent. RLS and realtime filters rely on it.

## Modules in detail

Each module is a route under `/projects/[id]/…` or `/library/…`. The sections give the view, the behaviour and a check that Claude Code can turn into a test.

### App shell and navigation

- Global left sidebar: Home, Projects, Library (Talents, Locations, Crew, Equipment, Brands, Clients), Settings. Members see only what their role allows.
- Inside a project a second sidebar: Overview, Concept, Moodboard, Shot list, Schedule, Crew and cast, Packing lists, Tasks, Budget, Files, Review. Narrative projects add Script, Breakdown, Stripboard and Day-out-of-days.
- Home (`/`): my tasks due today and overdue with project name, upcoming shoot days, recently edited projects, unread notifications.
- Header: presence avatars of everyone currently in the project, notification bell, command palette on Cmd+K.
- Light and dark mode. Fully usable at tablet width; phone width is for reading and checking off.

### Members and roles

- Settings → Members (owner, admin): list with role, last active and project count; invite, change role, deactivate; pending invitations with resend and revoke.
- Project → Members dialog (editor): add an existing member or invite a new person by email with a project role.
- A profile page lets each member set display name, avatar and cursor colour.
- Check: a member who is not in a project cannot open its URL, receives no realtime events from it and gets zero rows from a direct API call.

### Projects

- `/projects`: grid or list with cover, project number, client, next shoot day, member avatars; archive filter.
- Creating a project asks for name, type (short form or narrative), client, brand, aspect ratio (16:9, 9:16, 1:1, 4:5, 2.39:1) and time zone. The project number is suggested in sequence (`2026-001`).
- A new project starts with one creative, an empty concept, a moodboard and the four task columns.
- Overview: progress per module, total runtime against target, shoot days, open tasks, budget planned versus actual, recent activity.
- Duplicating a project copies structure and shots, not shoot days or members.

### Concept

- Several concepts per project in folders; type treatment, brief or note. Exactly one is active.
- Tiptap editor with headings, lists, to-dos, quotes, tables, images and embedded PDFs. Changes save continuously.
- Beat rail beside the text: beats with start and end in seconds, drawn as bars over the film's total length. Overlaps and gaps are flagged.
- Checkboxes for open items under each beat, for example permits.
- “Turn beats into segments” creates segments with the beat lengths as target times.
- Check: setting a second concept active deactivates the first in the same transaction.

### Moodboard

- Infinite canvas with zoom and pan. Elements: image, sticky note, text, colour swatch, link card, group.
- Images by drag and drop, paste from the clipboard or from the file library. Uploads go straight to storage; the canvas shows downsized previews.
- Connector lines between two elements, optionally with arrow and label.
- Multi-select, align, z-order, duplicate, undo and redo (50 steps, own changes only).
- Pull a palette from an image: five dominant colours as swatches.
- One board per project by default, more per creative.
- Export the selection or the whole board as PNG.
- Check: 200 images on one board stay smooth while dragging; changes are saved in batches every 500 ms.

### Tasks

- Kanban per project with the columns Open, In progress, Review, Done; columns can be renamed.
- Card: title, description, assignee, priority, labels, due date, subtasks, optional link to a shoot day, comment thread.
- List view as an alternative, sortable by due date and filterable by assignee.
- Check: dragging a card into the Done column sets `completed_at`; dragging it back clears it. Assigning a task creates a notification.

### Creatives, shot list and storyboard

- Creative switcher at the top; each creative has goal, key message, audience, must-haves, no-gos and aspect ratio.
- Four views of the same shots: List, Storyboard grid, Timeline, Script.
- **List:** one row per shot, grouped by segment. Columns: number, frame, action, audio, on-screen text, shot size, camera movement, angle, lens, frame rate, INT/EXT, day/night, cast, location, duration, setup time, status, note. Columns can be shown and hidden; custom columns of type text, number, select or checkbox.
- Inline editing with Tab and Enter like a spreadsheet. Enter in the last row adds a shot.
- Cast and location are searched and picked in the cell; an unknown name creates the library entry on the spot.
- Sort shots and segments by drag and drop, also across segments. Multi-select for move, duplicate, delete and image generation.
- **Segment header:** title, target time, sum of shot durations. Green up to the target, red above it. The totals of the creative and the project sit at the top.
- **Storyboard grid:** cards with the frame in the project's aspect ratio, number, size, duration, action. Two to six cards per row.
- **Timeline:** frames side by side, width proportional to duration, audio and on-screen text as tracks below. Play steps through the frames in real time.
- **Script:** two columns, picture and sound, for reading and printing.
- **Frames:** any number of versions per shot from upload, reference or AI; one is active. Uploaded images are cropped to the aspect ratio.
- In narrative projects a shot can belong to a scene; the list can then group by scene instead of segment.
- The option lists for shot sizes and movements live once in `lib/film/vocab.ts` and feed both the UI and the AI prompts.
- Check: the segment total changes with every duration keystroke; a reorder writes exactly one row.

### Library

- Talents, Locations, Crew, Equipment, Brands and Clients each as a table with search, filters and a detail page.
- Locations also as a map. Entering an address triggers geocoding; the detail page shows photos, parking, power, contact, permit number and the nearest hospital.
- Sub-locations through `parent_id`, for example “Stage 3” under “North Studio”.
- Each detail page lists the projects and shots that use the entry, limited to projects the viewer may read.

### Live collaboration

- **Presence:** avatars in the header show who is in the project and in which module. Presence state is ephemeral and never stored.
- **Live data:** every project view subscribes to `project:{id}`. A change event patches or invalidates the matching TanStack Query entry; a client ignores the echo of its own write.
- **Cursors on the moodboard:** named, coloured cursors and selection outlines over Broadcast, throttled to 20 messages per second per client.
- **Shot list, schedule and stripboard:** a coloured outline with the member's name marks the cell, block or strip someone is editing or dragging.
- **Concept:** true co-editing with Yjs. Peers exchange updates over the project channel; each client saves the merged state to `concepts.ydoc` two seconds after its last change, and the server merges before writing, so parallel saves cannot overwrite each other. `content` keeps a JSON snapshot for PDF, search and AI.
- **Conflict rule elsewhere:** last write wins per field. Server Actions send only changed fields; if another member changed the same field meanwhile, a toast names them and shows their value.
- **Comments:** threads on shots, tasks, scenes, moodboard elements and concepts, with @ mentions and resolve.
- **Notifications:** bell inbox for mentions, assignments, replies, accepted invitations and published call sheets. Optional daily email digest.
- **Activity:** a feed per project (“Anna added 12 shots”), written by the Server Actions.
- Check: with two browsers signed in as different members, an edit in one appears in the other within one second. A viewer sees edit controls disabled, and a forged write is rejected by RLS.

### Shoot days and schedule

- `/projects/[id]/schedule`: one column per shoot day side by side, plus an “Unscheduled” column with every shot that has no block.
- Dragging a shot from Unscheduled onto a day creates a shot block. Block duration = setup time plus shooting time; the default is 15 minutes and can be changed per shot.
- Other block types: move, break, briefing, setup, free text. Every block has a duration in minutes.
- **Time maths:** the first block starts at the shooting call. Every later block starts when the previous one ends. Wrap is the end of the last block. The function `computeSchedule(day, blocks)` lives in `lib/schedule/compute.ts`, is pure and fully tested.
- Drag a block by its handle, also onto another day; all later times recalculate without any typing.
- **Move:** pick start and destination; travel time and distance come from OpenRouteService and prefill the duration. The route shows on a small map. If the location changes between two shot blocks with no move between them, the app suggests one.
- **Day header:** date, day X of Y, general call, shooting call, lunch, wrap, total duration. Below it, per location: sunrise, sunset, golden hour, temperature, rain probability, wind.
- **Warnings:** an exterior day shot falls outside daylight; lunch is more than six hours after general call; the day runs over ten hours; a talent has a shot before their call time.
- **On the day:** a line marks the current time and blocks can be checked off. The header shows how far ahead of or behind the plan the day is.
- Weather exists only for the next 16 days; before that the app shows sun times only.
- Check: dragging a 30-minute block in front of a 09:00 block shifts that block and every later one by exactly 30 minutes.

### Crew and cast

- `/projects/[id]/crew`: a matrix of people and shoot days. One click books a person on a day.
- Each booking has role, department, individual call time, day rate and status (requested, confirmed, declined).
- Cast is suggested from the day's shots or scenes; each person gets call, makeup and costume times.
- Without an individual call time the day's general call applies.
- Every confirmed booking creates or updates a budget line.
- A crew entry can be linked to a workspace member, so their bookings appear on their Home page.

### Call sheet

- `/projects/[id]/schedule/[dayId]/callsheet` is a view of the shoot day, not a separate document. When the plan changes, the call sheet changes.
- Sections: header (project, client, date, day X of Y, production office), times, weather and light, locations with parking, contact and permit number, emergency with the nearest hospital and the local emergency number, run order, cast with call, makeup and costume, crew by department, notes.
- Typed by hand is only what exists nowhere else: production office, safety and catering notes.
- The nearest hospital is looked up through Overpass when a location is saved and can be overridden.
- PDF export on A4 with your own logo.
- Publishing freezes nothing but sets `published_at`; later changes show a “changed since sending” note.
- Sending and confirmation follow in phase 9.

### Equipment and packing lists

- Inventory with categories, condition, quantity, storage location, container, serial number, purchase data and customs fields. Accessories hang on the main item through `parent_equipment_id`.
- Kits bundle items, for example “A-cam” or “Interview lighting”.
- Packing list per shoot day or per department, filled from items, kits, props and free lines. A kit expands into its items.
- Check off by tapping, large rows for the phone, progress bar, name of who checked. Works offline.
- **Double booking:** if an item sits in packing lists of several projects on the same date and the sum exceeds stock, the row shows a warning with a link to the other project.
- Exports: packing list as PDF, carnet list as CSV with description, serial number, weight, value, country of origin and customs tariff number.

### Budget

- A sheet by category: crew, cast, locations, equipment, travel, hotel, catering, post-production, other.
- Lines from crew and cast bookings, location day rates and equipment day rates appear automatically and are marked “auto”. Free lines can be added.
- Each line has quantity, unit, unit price, planned and actual. Totals per category and overall against `projects.budget_cents`.
- Visible to owner, admin and project editors only.
- Export as CSV and PDF.

### Script (narrative projects)

- `/projects/[id]/script`: import a `.fountain` or `.fdx` file. The parser turns it into scenes and reads INT/EXT, set name and day/night from each scene heading.
- Scene numbers come from the file or are assigned 1 to n. Scene length is estimated in eighths of a page at 55 lines per page and can be corrected per scene.
- Reader view in screenplay layout with a scene navigator. The script is read-only here; writing stays in your screenwriting tool.
- Scenes can also be created by hand, for projects that start from an outline.
- Characters with dialogue become `characters` rows and are tagged as cast in their scenes on import.
- **New draft:** importing again creates a new `scripts` version. Scenes are matched by number, then by heading. Unchanged scenes keep their breakdown; changed and new scenes get a “needs review” badge; removed scenes are marked omitted and leave the stripboard only after confirmation.
- Check: importing the same file twice changes nothing; importing a draft with one edited scene flags exactly that scene.

### Script breakdown

- `/projects/[id]/breakdown`: script text on the left, the breakdown sheet of the current scene on the right.
- Select text and pick a category (keys 1 to 9 for the first nine) to tag an element. The tagged text is highlighted in the category colour.
- Fourteen default categories, editable per project: cast, background, stunts, vehicles, props, wardrobe, makeup and hair, set dressing, special effects, visual effects, sound and music, animals, special equipment, notes.
- Elements are project-wide. “Knife” tagged in scenes 3 and 12 is one element with two scene links. Duplicates can be merged.
- Cast elements point to a character with a cast number and optionally to a talent. Prop elements can link to `props`, special equipment to `equipment`, so they flow into packing lists.
- **Breakdown sheet:** scene number, INT/EXT, set, day/night, script day, page count, estimated shooting time, location, one-line synopsis, then the elements by category.
- Reports: elements by category with their scene numbers, scenes by location, scene count per character.
- Export: one breakdown sheet per scene as PDF, element lists as CSV.
- Check: tagging the same word in two scenes yields one element; deleting a scene link leaves the element while other scenes use it.

### Stripboard

- `/projects/[id]/stripboard`: every scene is a strip showing scene number, INT/EXT, set, day/night, page count, cast numbers, estimated time, location and synopsis.
- Strip colour follows INT/EXT and day/night with four defaults that can be changed per project: day interior white, day exterior yellow, night interior blue, night exterior green.
- Shoot days appear as day-break strips with date, day number and day totals: pages, estimated time, scene count. Unscheduled scenes wait in the boneyard.
- Drag strips within a day, between days and to and from the boneyard; multi-select moves a group. Banner strips mark company moves, meals and notes.
- Sort a selection or a day by location, set, INT/EXT, day/night or cast.
- **Suggest a schedule:** groups unscheduled scenes by location, then day/night, and fills days up to a page target (default 5 pages). The result is a preview that you apply or discard.
- **One data set with the schedule:** a strip is a `schedule_blocks` row of type `scene`. In the Schedule view the same row is a block that contains the scene's shots. Moving it in either view moves it in both.
- A scene block's duration is the sum of its shot blocks when shots exist, otherwise `scenes.est_minutes`. `computeSchedule` handles both.
- Days of kind travel, rest or prep appear as grey day breaks and hold no strips.
- Exports: stripboard as PDF, one-line schedule as PDF, shooting schedule with elements per scene as PDF.
- Check: moving a strip to another day updates both day totals and the day-out-of-days report without a reload, for every member who has it open.

### Day-out-of-days

- `/projects/[id]/dood`: a matrix with one row per cast member in cast-number order and one column per calendar day from the first to the last shoot day.
- A category switcher shows the same report for background, vehicles, props, animals and any other breakdown category.
- Codes are computed by the pure function `computeDood(days, sceneBlocks, sceneElements, overrides)` in `lib/dood/compute.ts`:

| Code | Meaning | Rule |
| --- | --- | --- |
| SW | Start work | First day with a scheduled scene |
| W | Work | A day with a scheduled scene between first and last |
| WF | Work finish | Last day with a scheduled scene |
| SWF | Start, work, finish | The only working day |
| H | Hold | A shoot day between first and last without a scene |
| T, R, F | Travel, rehearsal, fitting | Set by hand, stored in `dood_overrides` |

- Days of kind rest stay empty. Drop and pick-up codes are not generated.
- Total columns per row: work days, hold days, travel days, total, start date, finish date.
- Nothing but the manual overrides is stored; the report always reflects the stripboard.
- Export as landscape PDF and as CSV.
- Check: unit tests cover a one-day role (SWF), a gap between two working days (H), a manual travel day before the start, and an element with no scheduled scenes (empty row).

### Files

- File library per project with folders, preview for images, PDFs and videos, multi-upload.
- Each file shows where it is used (moodboard, frame, concept, script) and who uploaded it.

### Review

- `/projects/[id]/review`: upload cuts and stills, with versions per item (V1, V2).
- Player with frame stepping, space bar and J/K/L. Adding a comment pauses playback and stores the timecode.
- Draw on the paused frame: pen, arrow, rectangle. Strokes are stored as normalised coordinates and shown when the comment is opened.
- Comment markers on the timeline; comments can be resolved.
- Status per version: in review, changes requested, approved. Approval stores name and time.
- Members comment under their account. Through a token link a client sees only this item, comments under a name they type, approves and downloads the approved file. They see neither schedule nor packing list.

## AI features

The AI drafts and a person decides: every output lands as a proposal that an editor accepts, changes or discards. Nothing is overwritten unasked.

| Function | Input | Output |
| --- | --- | --- |
| Concept proposal | Brief, brand, creative goal, length | Treatment draft with beats as a new concept |
| Summary | Active concept | Short version in `concepts.summary` |
| Sharpen | Key message, audience | Three variants to choose from |
| Shot-list draft | Active concept, beats, aspect ratio | Segments and shots as structured data, validated with Zod |
| Rewrite a shot | One shot plus an instruction | New fields for exactly that shot |
| Generate frames | Selected shots | One image per shot from action, shot size, angle, aspect ratio and project style |
| Regenerate one | One shot | A new frame version; the old ones stay |
| Suggest breakdown | One scene or the whole script | Proposed elements per scene and category, reviewed before they are saved |
| Assistant | Free chat inside a project | Answers and proposals with access to project data |

**Implementation**

- Route Handlers under `/api/ai/*`, keys on the server only, text answers streamed.
- One system prompt in `lib/ai/system.ts` with the film vocabulary from `lib/film/vocab.ts` and the project's brand context.
- In the assistant, `@` pulls concepts, creatives, scenes, talents and locations into the request as context.
- The assistant may create tasks and add shots. Every write shows a confirmation first and runs with the caller's permissions.
- Image interface `generateFrame({ prompt, aspectRatio, references })` in `lib/ai/image.ts` with one adapter per provider. The provider is set in `AI_IMAGE_PROVIDER`.
- “Use references” passes the talent's profile picture and the location photo when the provider accepts image input.
- Frame style is a project setting: pencil sketch, greyscale storyboard or photorealistic.
- The browser sends one request per image, three in parallel at most. Each function stays far below the time limit, and a failure affects one image.
- AI functions need the editor role. Every generation writes a row to `ai_generations` with the user. When the workspace's monthly limit is reached, planning keeps working and only the button is locked.

## Exports, offline mode and devices

Every export is built from the same data as the screen view; there are no separate export documents to maintain. Any project role may export what it can read.

| Export | Format | Content |
| --- | --- | --- |
| Concept | PDF | Treatment with images and beats |
| Shot list | PDF, CSV | Chosen columns, by segment or scene |
| Storyboard | PDF, PNG bundle | Grid with 6, 9 or 12 frames per page |
| Moodboard | PNG | Selection or whole board |
| Schedule | PDF, CSV | Blocks with start, end, duration, location |
| Call sheet | PDF | All sections on A4 |
| Packing list | PDF, carnet CSV | Line items with quantity; customs fields in the CSV |
| Budget | PDF, CSV | Categories, planned, actual |
| Breakdown | PDF, CSV | One sheet per scene; element lists |
| Stripboard | PDF | Strips with day breaks; one-line schedule; shooting schedule |
| Day-out-of-days | PDF, CSV | Matrix with totals, per category |
| Project | ZIP | All PDFs and CSVs, a JSON dump of the project data and the original files |

- PDFs are rendered in Route Handlers with `@react-pdf/renderer`, one template per document under `lib/pdf/`. Logo and company line come from `app_settings`.
- The project ZIP is packed in the browser (`fflate`), because videos are too large for a function response. It needs the editor role.

**Offline set mode**

- `/set/[dayId]` is a reduced phone view: run of the day with the now-line, shot or scene details with frame, call sheet, packing list.
- Opened with a connection, the app loads the day and its frames into IndexedDB; a “Save for offline” button does it explicitly.
- Exactly two writes work offline: check off a block and check off a packing-list item. They queue and replay in order once the connection returns.
- If two people checked the same item, the earlier timestamp stays. A check-off is never undone by a sync.
- Everything else is read-only offline. A banner shows the state and the number of queued changes.

**Devices**

- Installable PWA with manifest and icons; fully usable on an iPad in landscape, drawing in review with a pen through Pointer Events.
- Phone: Home, set mode, tasks and packing lists are optimised; shot list, stripboard and moodboard are readable but not meant for editing.
- No Watch app. Call times export as `.ics` into the calendar and reach the watch that way.

## Repository structure and conventions for Claude Code

One repository, one Next.js project, domain logic kept apart from the UI. This plan lives in the repo as `docs/PLAN.md`; the rules below go into `CLAUDE.md`.

```text
.
├── CLAUDE.md
├── docs/
│   ├── PLAN.md
│   └── CHANGELOG.md
├── supabase/
│   ├── migrations/            # one SQL file per phase, including RLS policies
│   ├── tests/                 # RLS tests: editor, viewer, outsider, anonymous
│   └── seed.sql               # demo workspace with three users and two projects
├── src/
│   ├── app/
│   │   ├── (auth)/{login,accept-invite,reset-password}/
│   │   ├── (app)/             # everything behind the login
│   │   │   ├── page.tsx       # Home
│   │   │   ├── projects/[id]/{overview,concepts,moodboard,shotlist,schedule,crew,packing,tasks,budget,files,review}/
│   │   │   ├── projects/[id]/{script,breakdown,stripboard,dood}/
│   │   │   ├── library/{talents,locations,crew,equipment,brands,clients}/
│   │   │   ├── set/[dayId]/
│   │   │   └── settings/{members,workspace,profile}/
│   │   ├── share/[token]/     # public, token-checked
│   │   └── api/{ai,export,share,geo,cron}/
│   ├── features/              # per module: components, actions.ts, queries.ts, schema.ts
│   ├── lib/
│   │   ├── supabase/          # server.ts, client.ts, middleware.ts, admin.ts
│   │   ├── permissions/       # roles, usePermissions, server guards
│   │   ├── realtime/          # project channel, presence, cursors, Yjs provider
│   │   ├── schedule/          # compute.ts + tests
│   │   ├── dood/              # compute.ts + tests
│   │   ├── script/            # parse.ts (Fountain, FDX) + fixtures
│   │   ├── film/vocab.ts
│   │   ├── ai/  pdf/  geo/  offline/
│   │   └── db.types.ts        # generated
│   ├── components/ui/         # shadcn
│   └── messages/en.ts         # all UI copy
└── e2e/                       # Playwright
```

**Rules for `CLAUDE.md`**

1. Implement only the current phase from `docs/PLAN.md`. Do not pull features forward from later phases.
2. English only: UI copy, identifiers, comments, commit messages, docs. UI copy lives in `messages/en.ts`, never inline.
3. Every schema change is a migration under `supabase/migrations/`. Every new table gets RLS, its policies and its `project_id` trigger in the same migration.
4. Every new table gets an RLS test in `supabase/tests/` in the same pull request. A table without a test fails CI.
5. Regenerate `db.types.ts` after each migration. No `any`, no hand-written table types.
6. Write only through Server Actions in `features/*/actions.ts`. Each validates input with Zod, checks the role with a guard from `lib/permissions/` and writes an `activity_log` row.
7. `lib/supabase/admin.ts` (service role) may be imported only by `app/share/`, `app/api/share/`, `app/api/cron/` and the invitation action. An ESLint rule enforces it.
8. Never store derived values. Time logic lives only in `lib/schedule/` and `lib/dood/`, with a unit test for every case.
9. Do not use Tillyboard's name, copy, icons or images anywhere. Write all UI copy yourself.
10. No new dependency without a reason in the commit message. Check the licence: MIT, Apache-2.0, BSD or ISC only.
11. Before each commit: `pnpm lint`, `pnpm typecheck`, `pnpm test`. At the end of each phase also `pnpm test:rls` and `pnpm e2e`.
12. Each phase ends with an entry in `docs/CHANGELOG.md`: what was built, what is open, which assumptions were made.
13. Never mention Tillyboard's name, copy, icons or images in any part of the project.
14. Never mention "authored by claude" or anything similar in any part of the project, commits or PRs, or documentation.

**Commands:** `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:rls`, `pnpm e2e`, `supabase start`, `supabase db reset`, `pnpm db:types`.

**Local development:** Supabase CLI with Docker, so migrations, RLS and realtime are verified locally before they reach the hosted project.

## Implementation phases

Ten phases, each runnable and deployable on its own. After phase 3 Shotlyst is usable for concept, moodboard and shot list; after phase 4 friends can work in it live. Each phase is its own Claude Code session with its own branch and pull request.

| Phase | Content | Acceptance |
| --- | --- | --- |
| 1 Foundation | Next.js scaffold, Tailwind, shadcn, Supabase local and hosted, email-and-password login, invitations, profiles, workspace and project roles, RLS helper functions and test harness, app shell, projects with members, clients, brands, file library with direct upload, Vercel deployment, CI | Without a session every route redirects to `/login`. An invited user sets a password and sees only the projects they were added to. RLS tests pass for editor, viewer, outsider and anonymous. Upload and preview work on the Vercel URL. |
| 2 Ideation | Concepts with editor, folders, beats and open items; moodboard; task board with assignees; Home | A concept with image and table survives a reload. A board with 200 images stays usable. A card moved to Done sets `completed_at`. |
| 3 Shot list | Creatives, segments, shots with all fields, custom columns, four views, frames by upload, talent library, PDF and CSV export for shot list, storyboard and concept | 100 shots can be entered by keyboard alone. A segment total turns red when over target. The PDF matches the screen view. |
| 4 Collaboration | Project channel, live data on all existing views, presence, moodboard cursors, editing outlines in the shot list, Yjs co-editing in the concept, comments with mentions, notifications, activity feed, role-aware UI | Two members see each other's edits within one second. Two people typing in one concept lose no text. A viewer cannot change anything, in the UI or by forged request. A member outside the project receives no events. |
| 5 Scheduling | Locations with map and geocoding, shoot days, blocks, time maths, drag and drop between days, moves with route, weather and light, warnings, export | Unit tests for `computeSchedule` cover move, delete, day change and empty days. A move between two addresses shows travel time and distance. |
| 6 Production | Crew directory, bookings per shoot day, cast times, call-sheet view and PDF, equipment, kits, props, packing lists, double-booking check, carnet CSV, budget | A changed block duration changes the call sheet with no further step. An item in two packing lists on one date shows the warning. A confirmed booking appears in the budget. A commenter cannot read the budget. |
| 7 Narrative tools | Project type, Fountain and FDX import, scenes, characters, draft versions, breakdown with categories and elements, breakdown sheets and reports, stripboard with day breaks and boneyard, schedule suggestion, day-out-of-days, their exports | A sample script imports into numbered scenes with correct INT/EXT and day/night. Tagging one word in two scenes gives one element. Moving a strip changes day totals and day-out-of-days codes. `computeDood` tests pass. |
| 8 AI | Text functions, assistant with `@` context, image interface with one adapter, frames for selected shots, single regeneration, breakdown suggestions, workspace quota | A shot-list draft from a concept yields valid segments and shots. Ten frames generate without a timeout. No key appears in the client bundle. A viewer cannot trigger generation. |
| 9 External | `share_links`, public call-sheet page with confirmation, sending by email, review with video upload, timecode comments, drawing, approval and download, read-only guest link | A token link shows only its record; a changed or expired token returns 404. A confirmation appears in the recipient list. |
| 10 Set and polish | PWA, offline set mode with queue, project ZIP, `.ics` export, command palette, keyboard shortcuts, empty states, email digest, performance | In flight mode a packing list can be checked off; after reconnecting the checks are in the database. The Lighthouse PWA audit passes. |

**Kick-off prompt for phase 1**

```text
Read docs/PLAN.md in full. Implement phase 1 only.
First create CLAUDE.md with the rules from the section "Repository structure and conventions",
then the scaffold, then the migration for the phase 1 tables with RLS and its tests.
Work in small commits. Ask before you deviate from an assumption in the plan.
Finish the phase with green checks, an entry in docs/CHANGELOG.md and a list of the
environment variables I need to set in Vercel and Supabase.
```

For every later phase this is enough: “Read `docs/PLAN.md` and `docs/CHANGELOG.md`. Implement phase N.”

## Deployment on Vercel and Supabase setup

Deployment is in place at the end of phase 1, so every later phase is checked on the real environment.

1. Create the Supabase project in an EU region.
2. Under Authentication, switch off sign-up for new users and create your own user with a long password.
3. Configure Resend as custom SMTP for auth emails. Supabase's built-in mail service is rate-limited and meant for testing.
4. Set the Site URL and the redirect URLs for `/accept-invite` and `/reset-password` to the production URL.
5. Run `supabase link` locally and apply the migrations with `supabase db push`. Buckets, policies and realtime authorization are part of the migrations.
6. Create the repository on GitHub and import it into Vercel. Framework detection handles the build.
7. Set the environment variables in Vercel for Production and Preview (table below).
8. Keep Vercel Authentication switched on for preview deployments. Previews use the same database.
9. Add a daily cron call to `/api/cron/keepalive`, protected by `CRON_SECRET`. It runs a small query and, from phase 10, sends the email digest.
10. Set up backups: a weekly GitHub Action running `pg_dump` into a private repository or bucket. Supabase's Free plan has no automatic backups.
11. Optionally connect your own domain.

| Variable | Purpose | Visible in the browser |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public key; useless without a session because of RLS | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Token links, invitations, cron | no |
| `OWNER_EMAIL` | The account that becomes workspace owner | no |
| `NEXT_PUBLIC_APP_URL` | Base for token links and emails | yes |
| `ANTHROPIC_API_KEY`, `AI_TEXT_MODEL` | Text AI | no |
| `AI_IMAGE_PROVIDER`, `AI_IMAGE_API_KEY` | Image AI | no |
| `ORS_API_KEY` | Routes | no |
| `RESEND_API_KEY`, `MAIL_FROM` | Invitations, call sheets, notifications | no |
| `CRON_SECRET` | Protects the cron endpoint | no |

Schema changes always run in this order: test the migration locally, apply it to Supabase, then merge the branch. New code never meets an old schema.

## Risks and costs

The largest risk is scope: 54 tables and ten phases are a lot for a private tool, and multi-user access plus the narrative tools added about a third. The phases are cut so that you can stop after phase 4, 6 or 7 and still have a complete tool.

| Risk | Effect | Countermeasure |
| --- | --- | --- |
| An RLS policy is wrong | A friend sees or changes a project they are not part of | Helper functions instead of hand-written policies, a test per table with four actors, CI fails without one |
| Co-editing in the concept is fragile | Lost or duplicated text | Yjs merges on the server before saving; fall back to a soft lock if the acceptance test fails |
| Live updates and optimistic edits collide | Flicker or stale values | One channel per project, echo suppression by client ID, last write wins per field |
| Script files vary | Scenes are split or numbered wrongly | Parser fixtures from several real scripts, every parsed field editable, hand-made scenes as a fallback |
| Supabase pauses Free projects after a week without activity | The app is unreachable after a break | Daily cron call or the Pro plan |
| Free plan: 1 GB file storage, 50 MB per upload, 500 MB database | Moodboards fit, review videos do not; several members fill it faster | Downsize images to 2,560 px before upload; move to Pro for review |
| Vercel Hobby is limited to personal, non-commercial use | Paid jobs are not covered | Vercel Pro in that case |
| Free geo services throttle | Geocoding or routing fails at times | Store results in the database, debounce input, every field can be overridden by hand |
| AI frames do not keep people consistent | The storyboard looks uneven | Pass reference images, default to a sketch style; frames are a picture idea, not a final image |
| The canvas is limited for free drawing | The moodboard feels tighter than the reference | No drawing in phase 2; switch to tldraw and settle the licence if needed |
| Offline sync gets complex | Lost check-offs on set | Two offline writes only, a tested queue |
| Claude Code drifts from the plan | Rework | One phase per session, acceptance criteria as tests, a changelog per phase |

| Item | Cost |
| --- | --- |
| Vercel Hobby | 0 USD |
| Supabase Free | 0 USD |
| Supabase Pro, once videos or more than 1 GB are needed | from 25 USD a month, 100 GB file storage included |
| Vercel Pro, if used commercially | 20 USD per user a month |
| Resend | Usage-based; invitations and call sheets for a small group are low volume |
| AI for text and images | Pay per use, capped by the monthly limit |
| Domain | Optional |

## Sources

Figures as of 10 November 2026.

- [Tillyboard home page](https://www.tillyboard.com/de/)
- [Tillyboard pre-production software](https://www.tillyboard.com/de/pre-production-software)
- [Tillyboard storyboard software](https://www.tillyboard.com/de/storyboard-software)
- [Tillyboard scheduling software](https://www.tillyboard.com/de/drehplan-software)
- [Tillyboard call-sheet software](https://www.tillyboard.com/de/callsheet-software)
- [Tillyboard API reference](https://www.tillyboard.com/api-reference)
- [Supabase pricing](https://supabase.com/pricing.md)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
