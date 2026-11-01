# Shotlyst — API

Base path: `/api/v1/<service>`. JSON only. Auth via session cookie (signed
token, verified by every service via `pkg/authx`). Errors as
`application/problem+json` (RFC 7807) with `type`, `title`, `status`,
`detail`, and optional `errors: [{field, message}]` for 422.

Service prefixes (ingress routes on these):

| Prefix | Service |
|---|---|
| `/api/v1/auth` | identity |
| `/api/v1/gear` | gear |
| `/api/v1/plan` | planning |
| `/api/v1/sun` | sun |
| `/api/v1/media` | media |
| `/api/v1/export` | export |

Paths below are written relative to the service prefix, e.g. `POST /projects`
in the planning section means `POST /api/v1/plan/projects`.

The authoritative contracts are `api/<service>.yaml`; TS clients are generated
per service into `web/src/api/<service>/` (`make gen`). Keep this document
and the specs in sync — when in doubt, the spec wins.

## Conventions

- IDs are UUIDs. Timestamps are RFC 3339 UTC.
- List endpoints return `{ "items": [...], "next_cursor": "…"|null }`.
  Lists inside a project (beats, shots) are small; return everything, no
  paging.
- `PATCH` accepts partial bodies; `null` clears a nullable field.
- Every resource response includes `updated_at`; writes may send
  `If-Unmodified-Since`-style `expected_updated_at` in the body to detect
  conflicts (returns 409). Optional in Phase 1 except for sync.
- All handlers scope by the session's `user_id`. 404 (not 403) for resources
  belonging to another user.

## identity — `/api/v1/auth`

| Method | Path | Body / Notes |
|---|---|---|
| POST | /register | `{email, password, display_name}` → 201 + session cookie |
| POST | /login | `{email, password}` → 200 + session cookie |
| POST | /logout | → 204, revokes session, clears cookie |
| POST | /refresh | → new cookie if session still valid (SPA calls before `exp`) |
| GET | /me | → `{id, email, display_name, locale}` |
| PATCH | /me | `{display_name?, locale?}` |

CSRF: all state-changing requests (any service) must send
`X-Shotlyst-Client: web`; enforced in `pkg/httpx`. No CSRF token endpoint.

## gear — `/api/v1/gear`

| Method | Path |
|---|---|
| GET / POST | /cameras |
| GET / PATCH / DELETE | /cameras/{id} |
| GET / POST | /lenses |
| GET / PATCH / DELETE | /lenses/{id} |
| GET | /presets — built-in list of common cameras/lenses to pick from (static JSON, Phase 2) |

Deleting a lens referenced by shots sets `shots.lens_id = null` (ON DELETE SET NULL).

## planning — `/api/v1/plan`

### Projects

| Method | Path | Notes |
|---|---|---|
| GET | /projects?status= | list with counts `{shot_count, must_count, done_count}` |
| POST | /projects | `{title, logline?, status?, default_camera_id?, template_id?}` |
| GET | /projects/{id} | full project: beats with nested shots, shoot days with sun, location, derived totals. **This is the shoot-mode snapshot.** |
| PATCH | /projects/{id} | |
| DELETE | /projects/{id} | cascades |
| POST | /projects/{id}/duplicate | → new project |
| GET | /projects/{id}/packing-list | Phase 2 |

### Locations

| Method | Path |
|---|---|
| GET / POST | /locations |
| PATCH / DELETE | /locations/{id} |

Geocoding (name → lat/lon) is done client-side with a provider the user
configures, or by typing coordinates. Not an API concern in Phase 1.

### Shoot days

| Method | Path |
|---|---|
| GET / POST | /projects/{id}/shoot-days |
| PATCH / DELETE | /shoot-days/{id} |

### Beats

| Method | Path | Notes |
|---|---|---|
| POST | /projects/{id}/beats | appended at end |
| PATCH / DELETE | /beats/{id} | delete moves its shots to `unassigned` beat? **No** — delete is refused (409) while shots exist; client must move or delete them. |
| PUT | /projects/{id}/beats/order | `{ids: [...]}` full order, atomic |

### Shots

| Method | Path | Notes |
|---|---|---|
| POST | /beats/{id}/shots | appended at end; accepts `client_id` for idempotency |
| PATCH / DELETE | /shots/{id} | |
| POST | /shots/{id}/duplicate | copies all fields, status reset to planned |
| PUT | /beats/{id}/shots/order | `{ids: [...]}` — ids may include shots currently in other beats (move) |
| PUT | /projects/{id}/shoot-order | `{ids: [...]}` sets `shoot_order` 1..n for listed shots; unlisted → null |
| POST | /shots/{id}/status | `{status, note?, changed_at}` — used by shoot mode and sync |
| POST | /shots/{id}/references | `{kind:'url', url}` or `{kind:'image', asset_id}` (asset uploaded to media first) |
| DELETE | /references/{id} | |
| POST | /shots/{id}/voice-memo | `{asset_id}` (audio uploaded to media first) |

### Idea cards

| Method | Path |
|---|---|
| GET / POST | /projects/{id}/ideas |
| PATCH / DELETE | /ideas/{id} |
| POST | /ideas/{id}/promote | `{to: 'beat'\|'shot', beat_id?}` → creates target, links card |

### Sync (offline shoot mode)

`POST /sync`

```json
{
  "project_id": "…",
  "mutations": [
    {"id":"uuid","type":"shot.status","shot_id":"…","status":"done","note":"","changed_at":"…"},
    {"id":"uuid","type":"shot.create","client_id":"uuid","beat_id":"…","title":"Unplanned: marmot","size":"MS","movement":"handheld","frame_rate":"60","audio":"ambience","priority":"nice","created_at":"…"},
    {"id":"uuid","type":"shot.note","shot_id":"…","note":"…"}
  ]
}
```

Response:

```json
{
  "results": [{"id":"uuid","result":"applied"|"conflict"|"rejected","detail":"…"}],
  "project": { ...full project snapshot... }
}
```

Rules: mutations applied in array order inside one transaction per batch;
already-seen `id`s (in `sync_log`) return `applied` without re-applying.
`shot.status` uses last-write-wins by `changed_at`. Response always returns
the fresh snapshot so the client replaces its cache.

## sun — `/api/v1/sun`

| Method | Path | Notes |
|---|---|---|
| GET | /times?lat=&lon=&date=&tz= | → sun times object (see data model §4). Stateless; cached 1 h per (lat,lon,date) in-process. Called by the SPA and by `planning` when building shoot-day payloads. |

## media — `/api/v1/media`

| Method | Path | Notes |
|---|---|---|
| POST | /assets | multipart `file` + `kind` (`image`\|`audio`) → `{asset_id, url, thumb_url?}`; MIME sniffed, EXIF stripped, thumbnails for images, 10 MB limit |
| GET | /assets/{id} | metadata + presigned URLs (short-lived) |
| DELETE | /assets/{id} | |

Ownership: assets are scoped by `user_id`; `planning` stores only `asset_id`
and resolves URLs through `media` when building snapshots (batched
`POST /assets/resolve {ids}`).

## export — `/api/v1/export`

| Method | Path | Notes |
|---|---|---|
| GET | /projects/{id}?format=csv\|md | fetches the snapshot from `planning` with the caller's token, renders, streams the file |

## ai — `/api/v1/ai` (Phase 3)

| Method | Path | Notes |
|---|---|---|
| POST | /projects/{id}/draft | `{style?, constraints?}` → proposed beats+shots (not persisted); client shows diff and user accepts per item |
| POST | /projects/{id}/review | → list of coverage findings `{severity, message, suggested_shot?}` |

## Share links (Phase 3, in planning)

| Method | Path |
|---|---|
| POST | /projects/{id}/share → `{url, token, can_comment}` |
| GET | /s/{token} (public) → read-only project |
| POST | /s/{token}/comments (public, rate-limited) |

## Health & metrics (every service, from `pkg/httpx`)

`GET /healthz` (liveness), `GET /readyz` (DB ping + optional dependency check), `GET /metrics` (Prometheus). Not routed through the ingress.
