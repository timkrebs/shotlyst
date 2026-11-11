-- Phase 3: creatives, segments, shots with frames and cast, custom shot-list
-- columns, the talent library.

-- ---------------------------------------------------------------------------
-- Library: talents (shared across projects)
-- ---------------------------------------------------------------------------

create table public.talents (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  type text not null default 'person' check (type in ('person', 'animal', 'object')),
  description text,
  birth_date date,
  languages text[] not null default '{}',
  residence text,
  contact text,
  daily_rate_cents integer check (daily_rate_cents >= 0),
  tags text[] not null default '{}',
  avatar_file_id uuid references public.files (id) on delete set null,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Project tables
-- ---------------------------------------------------------------------------

create table public.creatives (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved')),
  goal text,
  key_message text,
  audience text,
  -- Null means: use the project's aspect ratio.
  aspect_ratio text check (aspect_ratio in ('16:9', '9:16', '1:1', '4:5', '2.39:1')),
  must_haves text,
  no_gos text,
  position text collate "C" not null,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index creatives_project_id_idx on public.creatives (project_id);

create table public.segments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  creative_id uuid not null references public.creatives (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  target_duration_sec integer check (target_duration_sec >= 0),
  position text collate "C" not null,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index segments_creative_id_idx on public.segments (creative_id);
create index segments_project_id_idx on public.segments (project_id);

-- The single source for every shot. Shot IDs are chosen by the client, so a
-- new row can appear in the list before the server has answered.
create table public.shots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  creative_id uuid not null references public.creatives (id) on delete cascade,
  segment_id uuid not null references public.segments (id) on delete cascade,
  position text collate "C" not null,
  -- Optional label that replaces the running number.
  shot_number text,
  action text,
  audio text,
  on_screen_text text,
  script_text text,
  shot_size text,
  camera_movement text,
  camera_angle text,
  lens text,
  frame_rate text,
  equipment_note text,
  int_ext text check (int_ext in ('int', 'ext', 'int_ext')),
  day_night text check (day_night in ('day', 'night', 'dawn', 'dusk')),
  duration_sec integer not null default 0 check (duration_sec between 0 and 86400),
  setup_min integer check (setup_min between 0 and 1440),
  status text not null default 'planned' check (status in ('planned', 'ready', 'shot', 'dropped')),
  notes text,
  custom_values jsonb not null default '{}',
  active_frame_id uuid,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shots_segment_id_idx on public.shots (segment_id);
create index shots_creative_id_idx on public.shots (creative_id);
create index shots_project_id_idx on public.shots (project_id);

create table public.shot_talents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  shot_id uuid not null references public.shots (id) on delete cascade,
  -- Library rows are never cascade-deleted: a talent in use stays.
  talent_id uuid not null references public.talents (id) on delete restrict,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shot_id, talent_id)
);

create index shot_talents_project_id_idx on public.shot_talents (project_id);
create index shot_talents_talent_id_idx on public.shot_talents (talent_id);

-- Storyboard images with versions; shots.active_frame_id picks one.
create table public.shot_frames (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  shot_id uuid not null references public.shots (id) on delete cascade,
  file_id uuid not null references public.files (id),
  source text not null default 'upload' check (source in ('upload', 'reference', 'ai')),
  prompt text,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shot_frames_shot_id_idx on public.shot_frames (shot_id);
create index shot_frames_project_id_idx on public.shot_frames (project_id);
create index shot_frames_file_id_idx on public.shot_frames (file_id);

alter table public.shots
  add constraint shots_active_frame_id_fkey
  foreign key (active_frame_id) references public.shot_frames (id) on delete set null;
create index shots_active_frame_id_idx on public.shots (active_frame_id);

-- Custom columns of the shot list, and the visibility of built-in ones
-- (type 'builtin', key = the built-in column's key).
create table public.shotlist_columns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (char_length(label) between 1 and 60),
  type text not null check (type in ('text', 'number', 'select', 'checkbox', 'builtin')),
  config jsonb not null default '{}',
  position text collate "C" not null,
  visible boolean not null default true,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, key)
);

-- A board can belong to one creative; null means the project as a whole.
alter table public.moodboards
  add column creative_id uuid references public.creatives (id) on delete set null;
create index moodboards_creative_id_idx on public.moodboards (creative_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'talents', 'creatives', 'segments', 'shots', 'shot_talents', 'shot_frames',
    'shotlist_columns'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function private.set_updated_at()', t);
  end loop;
end;
$$;

-- project_id comes from the parent row. Named to run before the checks below
-- (BEFORE triggers fire in name order).
create trigger a_set_project_id before insert or update on public.segments
  for each row execute function private.set_project_id_from_parent('creatives', 'creative_id');
create trigger a_set_project_id before insert or update on public.shots
  for each row execute function private.set_project_id_from_parent('segments', 'segment_id');
create trigger a_set_project_id before insert or update on public.shot_talents
  for each row execute function private.set_project_id_from_parent('shots', 'shot_id');
create trigger a_set_project_id before insert or update on public.shot_frames
  for each row execute function private.set_project_id_from_parent('shots', 'shot_id');

-- A shot's creative is the creative of its segment, whatever the caller sent.
create function private.set_shot_creative() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select creative_id into new.creative_id from public.segments where id = new.segment_id;
  return new;
end;
$$;

create trigger b_set_shot_creative before insert or update on public.shots
  for each row execute function private.set_shot_creative();

create trigger check_file_project before insert or update on public.shot_frames
  for each row execute function private.check_same_project('files', 'file_id');
create trigger check_creative_project before insert or update on public.moodboards
  for each row execute function private.check_same_project('creatives', 'creative_id');

-- The active frame must be one of the shot's own frames.
create function private.check_active_frame() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.active_frame_id is not null and not exists (
    select 1 from public.shot_frames f where f.id = new.active_frame_id and f.shot_id = new.id
  ) then
    raise exception 'the active frame must belong to the shot' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_active_frame before insert or update on public.shots
  for each row execute function private.check_active_frame();

create trigger forbid_project_change before update on public.creatives
  for each row execute function private.forbid_project_change();
create trigger forbid_project_change before update on public.shotlist_columns
  for each row execute function private.forbid_project_change();

-- Rows keep their parent where moving them would strand their children:
-- a segment stays in its creative, a frame stays with its shot, and shots
-- and beats stay in their project.
create function private.forbid_parent_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) ->> tg_argv[0]) is distinct from (to_jsonb(old) ->> tg_argv[0]) then
    raise exception '% cannot change', tg_argv[0] using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger forbid_creative_change before update on public.segments
  for each row execute function private.forbid_parent_change('creative_id');
create trigger forbid_shot_change before update on public.shot_frames
  for each row execute function private.forbid_parent_change('shot_id');
create trigger forbid_project_change before update on public.shots
  for each row execute function private.forbid_project_change();
create trigger forbid_project_change before update on public.concept_beats
  for each row execute function private.forbid_project_change();

-- A new project also starts with one creative and its first segment.
create function private.seed_project_creative(p_project_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_creative_id uuid;
begin
  insert into public.creatives (project_id, title, position, created_by)
  values (p_project_id, 'Main film', 'V', p_user_id)
  returning id into v_creative_id;
  insert into public.segments (project_id, creative_id, title, position, created_by)
  values (p_project_id, v_creative_id, 'Segment 1', 'V', p_user_id);
end;
$$;

create or replace function private.seed_new_project() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_project_defaults(new.id, new.created_by);
  perform private.seed_project_creative(new.id, new.created_by);
  return new;
end;
$$;

-- Existing projects get the same.
select private.seed_project_creative(p.id, p.created_by)
from public.projects p
where not exists (select 1 from public.creatives c where c.project_id = p.id);

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC functions
-- ---------------------------------------------------------------------------

-- Copies a project's structure into a new project: details, creatives,
-- segments, shots with cast, custom columns, concepts with beats and open
-- items, and the task column names. Not copied: members, files, frames,
-- moodboards, tasks. The caller becomes the new project's editor.
create function public.duplicate_project(p_project_id uuid, p_name text, p_project_number text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_new uuid := gen_random_uuid();
begin
  if not private.is_active_member() or not private.can_read(p_project_id) then
    raise exception 'project not found' using errcode = '42501';
  end if;

  insert into public.projects (id, name, project_number, kind, description, brand_id, client_id,
                               aspect_ratio, timezone, created_by)
  select v_new, p_name, p_project_number, kind, description, brand_id, client_id,
         aspect_ratio, timezone, v_uid
  from public.projects where id = p_project_id;

  -- Replace what the new-project trigger seeded with copies of the source.
  delete from public.creatives where project_id = v_new;
  delete from public.concepts where project_id = v_new;
  delete from public.task_sections where project_id = v_new;

  create temporary table _map (old_id uuid primary key, new_id uuid not null) on commit drop;
  insert into _map
    select id, gen_random_uuid() from public.creatives where project_id = p_project_id
    union all select id, gen_random_uuid() from public.segments where project_id = p_project_id
    union all select id, gen_random_uuid() from public.shots where project_id = p_project_id
    union all select id, gen_random_uuid() from public.concept_folders where project_id = p_project_id
    union all select id, gen_random_uuid() from public.concepts where project_id = p_project_id
    union all select id, gen_random_uuid() from public.concept_beats where project_id = p_project_id;

  insert into public.creatives (id, project_id, title, status, goal, key_message, audience,
                                aspect_ratio, must_haves, no_gos, position, created_by)
  select m.new_id, v_new, c.title, 'draft', c.goal, c.key_message, c.audience,
         c.aspect_ratio, c.must_haves, c.no_gos, c.position, v_uid
  from public.creatives c join _map m on m.old_id = c.id
  where c.project_id = p_project_id;

  insert into public.segments (id, project_id, creative_id, title, description,
                               target_duration_sec, position, created_by)
  select m.new_id, v_new, mc.new_id, s.title, s.description, s.target_duration_sec, s.position, v_uid
  from public.segments s
  join _map m on m.old_id = s.id
  join _map mc on mc.old_id = s.creative_id
  where s.project_id = p_project_id;

  insert into public.shots (id, project_id, creative_id, segment_id, position, shot_number, action,
                            audio, on_screen_text, script_text, shot_size, camera_movement,
                            camera_angle, lens, frame_rate, equipment_note, int_ext, day_night,
                            duration_sec, setup_min, status, notes, custom_values, created_by)
  select m.new_id, v_new, mc.new_id, ms.new_id, s.position, s.shot_number, s.action,
         s.audio, s.on_screen_text, s.script_text, s.shot_size, s.camera_movement,
         s.camera_angle, s.lens, s.frame_rate, s.equipment_note, s.int_ext, s.day_night,
         s.duration_sec, s.setup_min, 'planned', s.notes, s.custom_values, v_uid
  from public.shots s
  join _map m on m.old_id = s.id
  join _map mc on mc.old_id = s.creative_id
  join _map ms on ms.old_id = s.segment_id
  where s.project_id = p_project_id;

  insert into public.shot_talents (project_id, shot_id, talent_id, created_by)
  select v_new, m.new_id, t.talent_id, v_uid
  from public.shot_talents t join _map m on m.old_id = t.shot_id
  where t.project_id = p_project_id;

  insert into public.shotlist_columns (project_id, key, label, type, config, position, visible, created_by)
  select v_new, key, label, type, config, position, visible, v_uid
  from public.shotlist_columns where project_id = p_project_id;

  insert into public.concept_folders (id, project_id, name, position, created_by)
  select m.new_id, v_new, f.name, f.position, v_uid
  from public.concept_folders f join _map m on m.old_id = f.id
  where f.project_id = p_project_id;

  insert into public.concepts (id, project_id, folder_id, title, type, status, is_active, content,
                               summary, created_by)
  select m.new_id, v_new, mf.new_id, c.title, c.type, 'draft', c.is_active, c.content,
         c.summary, v_uid
  from public.concepts c
  join _map m on m.old_id = c.id
  left join _map mf on mf.old_id = c.folder_id
  where c.project_id = p_project_id;

  insert into public.concept_beats (id, project_id, concept_id, title, description, start_sec,
                                    end_sec, position, created_by)
  select m.new_id, v_new, mc.new_id, b.title, b.description, b.start_sec, b.end_sec, b.position, v_uid
  from public.concept_beats b
  join _map m on m.old_id = b.id
  join _map mc on mc.old_id = b.concept_id
  where b.project_id = p_project_id;

  insert into public.beat_items (project_id, beat_id, label, done, position, created_by)
  select v_new, m.new_id, i.label, false, i.position, v_uid
  from public.beat_items i join _map m on m.old_id = i.beat_id
  where i.project_id = p_project_id;

  insert into public.task_sections (project_id, name, color, position, is_done, created_by)
  select v_new, name, color, position, is_done, v_uid
  from public.task_sections where project_id = p_project_id;

  drop table _map;
  return v_new;
end;
$$;

revoke execute on function public.duplicate_project(uuid, text, text) from public, anon;
grant execute on function public.duplicate_project(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ---------------------------------------------------------------------------

revoke all on public.talents from anon;
grant select, insert, update, delete on public.talents to authenticated;
grant all on public.talents to service_role;
alter table public.talents enable row level security;

-- Library rules: any active member reads and inserts; update by creator or
-- admin; delete by admin.
create policy talents_select on public.talents for select to authenticated
  using ((select private.is_active_member()));
create policy talents_insert on public.talents for insert to authenticated
  with check ((select private.is_active_member()) and created_by = (select auth.uid()));
create policy talents_update on public.talents for update to authenticated
  using ((select private.is_active_member())
         and (created_by = (select auth.uid()) or (select private.is_admin())))
  with check ((select private.is_active_member())
              and (created_by = (select auth.uid()) or (select private.is_admin())));
create policy talents_delete on public.talents for delete to authenticated
  using ((select private.is_admin()));

do $$
declare t text;
begin
  foreach t in array array[
    'creatives', 'segments', 'shots', 'shot_talents', 'shot_frames', 'shotlist_columns'
  ] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (private.can_read(project_id))', t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (private.can_edit(project_id))', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (private.can_edit(project_id)) with check (private.can_edit(project_id))',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (private.can_edit(project_id))', t || '_delete', t);
  end loop;
end;
$$;
