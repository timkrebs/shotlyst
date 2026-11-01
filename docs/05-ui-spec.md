# Shotlyst — UI Spec

Mobile-first. Two modes with distinct visual language:

- **Plan mode** (desktop & mobile): light or dark theme, dense but calm,
  drag-and-drop lists.
- **Shoot mode** (mobile): dark theme only, large type, high contrast, no
  drag-and-drop, one-thumb operation.

Design direction: utilitarian, like a good field notebook — not a SaaS
dashboard. Monospace numerals for times and focal lengths. Accent colour
used only for priority `must` and for the active shot in shoot mode.

## Routes

```
/login, /register
/projects                      Project list
/projects/:id                  Project overview (tabs below)
/projects/:id/beats            Beats & shots (main planning view)
/projects/:id/ideas            Idea board (Phase 1: notes list; Phase 2: canvas)
/projects/:id/days             Shoot days, sun times, shoot order
/projects/:id/shoot/:dayId     Shoot mode (PWA entry, offline)
/gear                          Cameras & lenses
/settings                      Account, locale, export data
/s/:token                      Public share view (Phase 3)
```

## Screens

### Project list
- Cards: title, status chip, shoot date (nearest), counts "12 shots · 5 must · 3 done".
- Primary action: "New project" → inline form (title, logline, default camera).
- Filter by status. Sort by updated.

### Project overview
- Header: title (editable inline), logline, status select, default camera, location.
- Summary tiles: shots, must, est. total time, lenses needed, next shoot day with sunrise/sunset.
- Tabs: Beats · Ideas · Days · Export.

### Beats & shots (core)
Desktop: two-pane. Left = beat list (collapsible), right = shot table for selected beat or "all". Mobile: single column, beats as sections, shots as cards.

Beat row: drag handle, title, intent (muted), target duration, time-of-day chip, shot count. "Add beat" at bottom.

Shot card/row shows: position, title, size chip, movement chip, lens short name + focal → equiv ("35 → 52 mm"), fps, audio icon, priority dot, status. Click opens shot editor (side sheet on desktop, full-screen sheet on mobile).

Shot editor fields (order): title, description, size (segmented), movement (select), lens (select from gear) + focal length (number, prefilled with lens min), frame rate (segmented: 24/25/30/50/60/120 with "more"), audio (select), priority (segmented), est. duration (sec), est. setup (min, placeholder shows default), time of day (select), tags (chips), references (thumbs + add URL/upload). Derived panel on the right: equivalent focal, est. total min, lens warning.

Shortcuts (desktop): `n` new shot in current beat, `d` duplicate, `⌘↑/↓` move, `1–7` set size.

Totals bar (sticky bottom on mobile, header on desktop): "18 shots · 7 must · ~2 h 40 · 3 lenses".

### Idea board
Phase 1: list of markdown notes with tags; each has "Promote → beat / shot" menu.
Phase 2: infinite canvas (tldraw) with note, image and link cards; same promote action.

### Shoot days
- List of days with date, time window, location, sun strip (dawn · golden · sunrise … sunset · golden · dusk) rendered as a horizontal bar.
- "Shoot order" sub-view: all shots of the project as a single reorderable list (drag on desktop, up/down buttons on mobile), assign to day via dropdown. Warn chip when a shot's effective time-of-day isn't inside the day's window (Phase 2).
- Button: "Open shoot mode".

### Shoot mode
- Header: project · day · live clock · "sunset 17:42 (in 2 h 10)". Offline indicator (dot) and pending-sync count.
- Progress: "6 / 18 · 4 must left".
- List: one shot per row, ≥ 72 px tall. Left: big status toggle (tap = done, long-press = menu: redo / skipped / planned). Centre: title, size+movement+fps line, lens/focal line. Right: priority dot.
- Tap row body → detail sheet: description, references (full width), note field, voice memo record button, status buttons.
- Floating "+" → quick add: title, size, movement, fps, priority (defaults from last shot), audio. Saved with `client_id`.
- Filters: all / remaining / must only. Group by beat toggle.
- Sync: auto on reconnect (all sync traffic goes to the planning service only; media blobs upload to `media` first, then the mutation references the `asset_id`); manual "Sync now" in header. Conflicts shown as a dismissable list ("Shot X status changed on server; kept server value").
- Keep screen awake toggle (Wake Lock API).

### Gear
Two lists: cameras, lenses. Camera form: name, make, model, sensor format (auto sets crop factor, editable), mount, codecs table (name, Mbps), battery minutes. Lens form: name, mount, focal min/max, max aperture, image circle, weight, stabilized. "Add from preset" (Phase 2).

### Export
Buttons: CSV, Markdown, (PDF Phase 3). Preview of Markdown inline.

## Components (shared)
`Chip`, `SegmentedControl`, `Select`, `Sheet` (side/bottom), `SortableList`
(dnd-kit wrapper), `SunStrip`, `StatusToggle`, `TotalsBar`, `EmptyState`,
`OfflineBadge`.

## Offline behaviour (shoot mode)
1. Entering `/projects/:id/shoot/:dayId` online → fetch `GET /api/v1/plan/projects/:id` (snapshot already includes sun times and resolved media URLs), store snapshot in IndexedDB (`projects` store, keyed by id, with `fetched_at`).
2. Service worker precaches app shell; runtime-caches reference image thumbnails on first view.
3. All mutations write to IndexedDB `mutations` store `{id, project_id, type, payload, created_at}` and update the local snapshot optimistically.
4. `navigator.onLine` + a periodic ping trigger `POST /api/v1/plan/sync`; on success replace the snapshot, clear applied mutations, show conflicts.
5. If the snapshot is older than 24 h and online, refresh before entering shoot mode (prompt).

## Empty states and onboarding
- First login: prompt to add a camera (with 5 common presets inline) — because derived values need it.
- Empty project: three-step hint "Add beats → add shots → open shoot mode" with a "Load example project" button (a hiking day with 3 beats, 9 shots).

## Copy tone
Short, imperative, no exclamation marks. Example: "Add a beat", "Mark done", "3 must-have shots left".
