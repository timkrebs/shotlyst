# Shotlyst — Data Model

Single source of truth for entities, fields and enums. Postgres DDL sketches
below are indicative; the authoritative DDL lives in
`services/<service>/migrations/`. One database, one schema per service:
`identity`, `gear`, `planning`, `media`. Cross-schema references (e.g.
`planning.shots.lens_id` → `gear.lenses.id`, `*.asset_id` →
`media.assets.id`) are plain UUID columns **without** foreign keys; the
owning service validates them at write time via `pkg/clientx`.
All tables: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `created_at`,
`updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`. All user-owned tables carry
`user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`.

## 1. Entity overview

```
identity:  users 1─∞ sessions
gear:      cameras, lenses  (per user)
planning:  projects 1─∞ beats 1─∞ shots ─(lens_id)─▶ gear.lenses
                    ├─∞ shot_references ─(asset_id)─▶ media.assets
                    ├─∞ idea_cards
                    ├─∞ shoot_days
                    ├─(location_id)─▶ locations
                    └─(default_camera_id)─▶ gear.cameras
           project_templates, sync_log
media:     assets (user_id, kind, s3_key, thumb_key, mime, bytes, sha256)
```

## 2. Enums

```sql
CREATE TYPE project_status AS ENUM ('planning', 'shooting', 'post', 'done', 'archived');

CREATE TYPE shot_size AS ENUM (
  'EWS',   -- extreme wide / establishing
  'WS',    -- wide
  'MWS',   -- medium wide
  'MS',    -- medium
  'MCU',   -- medium close-up
  'CU',    -- close-up
  'ECU',   -- extreme close-up
  'INSERT',-- detail / cutaway
  'POV',
  'OTS'    -- over the shoulder
);

CREATE TYPE camera_movement AS ENUM (
  'static', 'pan', 'tilt', 'handheld', 'gimbal', 'slider', 'dolly',
  'crane', 'drone', 'walk_and_talk', 'whip', 'zoom', 'rack_focus', 'other'
);

CREATE TYPE frame_rate AS ENUM ('23_976', '24', '25', '29_97', '30', '50', '59_94', '60', '100', '120', '240');

CREATE TYPE audio_need AS ENUM ('none', 'ambience', 'dialogue', 'voiceover_later', 'music_only');

CREATE TYPE shot_priority AS ENUM ('must', 'should', 'nice');

CREATE TYPE shot_status AS ENUM ('planned', 'done', 'redo', 'skipped');

CREATE TYPE time_of_day AS ENUM (
  'any', 'pre_dawn', 'sunrise', 'golden_morning', 'morning', 'midday',
  'afternoon', 'golden_evening', 'sunset', 'blue_hour', 'night'
);

CREATE TYPE sensor_format AS ENUM ('full_frame', 'aps_c', 'super35', 'mft', 'one_inch', 'other');

CREATE TYPE lens_mount AS ENUM ('sony_e', 'canon_rf', 'nikon_z', 'l_mount', 'fuji_x', 'mft', 'pl', 'other');
```

Frame rate as enum (not numeric) keeps 23.976 / 29.97 unambiguous. The UI
displays them as "23.98", "29.97" etc.

## 3. Tables

### users
| column | type | notes |
|---|---|---|
| email | citext unique | |
| password_hash | text | argon2id |
| display_name | text | |
| locale | text default 'en' | |

### sessions
| column | type | notes |
|---|---|---|
| user_id | uuid fk | |
| token_hash | bytea unique | sha256 of cookie token |
| expires_at | timestamptz | |
| last_seen_at | timestamptz | |

### cameras
| column | type | notes |
|---|---|---|
| user_id | uuid fk | |
| name | text | e.g. "Sony FX30" |
| make | text | |
| model | text | |
| sensor_format | sensor_format | |
| crop_factor | numeric(4,2) | 1.00 FF, 1.50 APS-C, 2.00 MFT |
| mount | lens_mount | |
| codecs | jsonb | `[{"name":"XAVC S-I 4K 25p","mbps":300}, ...]` |
| battery_minutes | int null | typical runtime at 4K, for estimates |
| notes | text | |

### lenses
| column | type | notes |
|---|---|---|
| user_id | uuid fk | |
| name | text | "Sony 16-35 F2.8 GM II" |
| mount | lens_mount | |
| focal_min_mm | int | prime: min = max |
| focal_max_mm | int | |
| aperture_max | numeric(3,1) | at wide end |
| image_circle | sensor_format | FF lens on APS-C body is fine; APS-C lens on FF body flags a warning |
| weight_g | int null | packing list |
| stabilized | bool | |

### projects
| column | type | notes |
|---|---|---|
| user_id | uuid fk | |
| title | text | |
| logline | text | one or two sentences |
| status | project_status | |
| default_camera_id | uuid fk cameras null | |
| location_id | uuid fk locations null | |
| target_duration_sec | int null | final film length target |
| notes | text | markdown |
| template_id | uuid null | if created from template |

### locations
| column | type | notes |
|---|---|---|
| user_id | uuid fk | |
| name | text | "Zugspitze summit" |
| lat | double precision | |
| lon | double precision | |
| elevation_m | int null | |
| timezone | text | IANA, resolved on save |

### shoot_days
| column | type | notes |
|---|---|---|
| project_id | uuid fk | |
| date | date | |
| start_time | time null | |
| end_time | time null | |
| location_id | uuid fk null | overrides project location |
| notes | text | |

Sun times are **not stored**; they are computed per request from location +
date (ADR-5) and returned in the shoot day payload.

### beats
| column | type | notes |
|---|---|---|
| project_id | uuid fk | |
| position | int | gap-based ordering |
| title | text | "Summit" |
| intent | text | "show scale and exhaustion" |
| target_duration_sec | int null | |
| time_of_day | time_of_day default 'any' | |
| location_id | uuid fk null | |
| notes | text | |

### shots
| column | type | notes |
|---|---|---|
| project_id | uuid fk | denormalized for cheap project-wide queries |
| beat_id | uuid fk | |
| position | int | story order inside beat |
| shoot_order | int null | global order for shoot mode; null = fall back to story order |
| shoot_day_id | uuid fk null | |
| title | text | short, e.g. "Boots on scree, low angle" |
| description | text | |
| size | shot_size | |
| movement | camera_movement | |
| lens_id | uuid fk lenses null | |
| focal_length_mm | int null | the intended focal length on the lens as marked |
| frame_rate | frame_rate | |
| audio | audio_need | |
| priority | shot_priority default 'should' | |
| status | shot_status default 'planned' | |
| est_duration_sec | int null | expected screen time |
| est_setup_min | int null | time to get it on location; default by movement type |
| time_of_day | time_of_day default 'any' | overrides beat |
| tags | text[] | |
| status_note | text | set in shoot mode |
| status_changed_at | timestamptz null | |
| voice_memo_asset_id | uuid null | → media.assets |
| client_id | uuid null unique | idempotency key for offline-created shots |

### shot_references
| column | type | notes |
|---|---|---|
| shot_id | uuid fk | |
| kind | text check in ('image','url') | |
| url | text null | external URL (kind=url) |
| asset_id | uuid null | → media.assets (kind=image) |
| caption | text | |

### idea_cards (Phase 1 notes-only; Phase 2 full board)
| column | type | notes |
|---|---|---|
| project_id | uuid fk | |
| kind | text check in ('note','image','link') | |
| body | text | markdown for notes |
| url | text null | |
| x, y | int | board coordinates (Phase 2) |
| tags | text[] | |
| promoted_to_beat_id | uuid null | set when converted |
| promoted_to_shot_id | uuid null | |

### project_templates (Phase 2)
| column | type | notes |
|---|---|---|
| user_id | uuid fk null | null = built-in |
| name | text | "Hiking vlog" |
| body | jsonb | beats + shots skeleton |

### media.assets
| column | type | notes |
|---|---|---|
| user_id | uuid | |
| kind | text check in ('image','audio') | |
| s3_key | text | `users/{uid}/{asset_id}.{ext}` |
| thumb_key | text null | images only |
| mime | text | sniffed |
| bytes | bigint | |
| sha256 | bytea | dedupe within user |

### sync_log (planning)
| column | type | notes |
|---|---|---|
| user_id | uuid fk | |
| client_mutation_id | uuid unique | |
| applied_at | timestamptz | |
| result | text | 'applied' / 'conflict' / 'rejected' |
| detail | jsonb | |

## 4. Derived values (computed in `domain`, returned in API)

Computed by `planning` (`services/planning/domain`). Camera and lens data
come from `gear` via `pkg/clientx` with a 60 s in-process cache; if `gear`
is unavailable, derived fields are `null` and `derived.warnings` contains
`"gear_unavailable"`. Sun times come from the `sun` service the same way
(`"sun_unavailable"`).

### Per shot
- `equiv_focal_mm` = `focal_length_mm × camera.crop_factor` (camera = project
  default camera). Null if either missing.
- `lens_warning` = `"aps_c_lens_on_ff"` when `lens.image_circle = aps_c` and
  `camera.sensor_format = full_frame`; else null.
- `est_total_min` = `est_setup_min` (default by movement: static 3, handheld 2,
  gimbal 8, slider 10, drone 15, other 5) + `ceil(est_duration_sec × 3 / 60)`
  (assume three takes).
- `effective_time_of_day` = shot override if not `any`, else beat value.

### Per project / shoot day
- `shot_count`, `must_count`, `done_count`, `redo_count`.
- `est_total_min` = sum over shots in the day (or project).
- `lens_set` = distinct lenses referenced; `missing_lens_shots` = shots
  without a lens.
- `card_estimate` (Phase 2): for the selected codec, `total_minutes ×
  mbps × 60 / 8 / 1024` → GB; `cards_needed = ceil(GB / card_size_gb)`.
- `battery_estimate` (Phase 2): `ceil(total_minutes / camera.battery_minutes)`.
- `sun` (if location + date): `sunrise, sunset, civil_dawn, civil_dusk,
  golden_morning_start/end, golden_evening_start/end, blue_morning, blue_evening`.

### Shoot-mode ordering
If any shot in the day has `shoot_order`, order by `shoot_order NULLS LAST`,
then by beat position, then shot position. Otherwise story order.

## 5. Indexes

- `shots(project_id, beat_id, position)`
- `shots(project_id, shoot_day_id, shoot_order)`
- `beats(project_id, position)`
- `projects(user_id, status, updated_at desc)`
- `sessions(token_hash)`, `sessions(expires_at)` for cleanup
- `shots(client_id)` unique partial where not null

## 6. Example JSON (shot, as returned by API)

```json
{
  "id": "6f2c…",
  "beat_id": "a91e…",
  "position": 2000,
  "shoot_order": 4,
  "title": "Boots on scree, low angle",
  "description": "Tracking from behind, foreground rocks",
  "size": "CU",
  "movement": "gimbal",
  "lens_id": "b7d0…",
  "focal_length_mm": 35,
  "frame_rate": "60",
  "audio": "ambience",
  "priority": "must",
  "status": "planned",
  "est_duration_sec": 6,
  "est_setup_min": null,
  "time_of_day": "any",
  "tags": ["b-roll"],
  "references": [],
  "derived": {
    "equiv_focal_mm": 52,
    "lens_warning": null,
    "est_total_min": 9,
    "effective_time_of_day": "golden_morning"
  },
  "updated_at": "2026-11-01T10:12:00Z"
}
```
