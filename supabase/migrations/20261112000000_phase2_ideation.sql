-- Phase 2: concepts with folders, beats and open items; moodboards; tasks.
--
-- Every table carries project_id. Child tables get it from their parent in a
-- trigger, so each policy is one helper call.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.concept_folders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  position text collate "C" not null,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index concept_folders_project_id_idx on public.concept_folders (project_id);

create table public.concepts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  folder_id uuid references public.concept_folders (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  type text not null default 'treatment' check (type in ('treatment', 'brief', 'note')),
  status text not null default 'draft' check (status in ('draft', 'final')),
  is_active boolean not null default false,
  -- Editor document as JSON. The co-editing state arrives in phase 4.
  content jsonb not null default '{"type": "doc", "content": [{"type": "paragraph"}]}',
  summary text,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index concepts_project_id_idx on public.concepts (project_id);
create index concepts_folder_id_idx on public.concepts (folder_id);
-- Exactly one active concept per project.
create unique index concepts_one_active_per_project
  on public.concepts (project_id) where is_active;

create table public.concept_beats (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  concept_id uuid not null references public.concepts (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  start_sec integer not null check (start_sec >= 0),
  end_sec integer not null,
  position text collate "C" not null,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_sec > start_sec)
);

create index concept_beats_concept_id_idx on public.concept_beats (concept_id);
create index concept_beats_project_id_idx on public.concept_beats (project_id);

create table public.beat_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  beat_id uuid not null references public.concept_beats (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 300),
  done boolean not null default false,
  position text collate "C" not null,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index beat_items_beat_id_idx on public.beat_items (beat_id);
create index beat_items_project_id_idx on public.beat_items (project_id);

create table public.moodboards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index moodboards_project_id_idx on public.moodboards (project_id);

-- Node IDs are chosen by the client, so a batch can reference new nodes.
create table public.moodboard_nodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  board_id uuid not null references public.moodboards (id) on delete cascade,
  type text not null check (type in ('image', 'note', 'text', 'color', 'link', 'group')),
  x double precision not null,
  y double precision not null,
  width double precision not null check (width > 0),
  height double precision not null check (height > 0),
  z integer not null default 0,
  data jsonb not null default '{}',
  -- A file in use on a board cannot be deleted from the library.
  file_id uuid references public.files (id),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index moodboard_nodes_board_id_idx on public.moodboard_nodes (board_id);
create index moodboard_nodes_project_id_idx on public.moodboard_nodes (project_id);
create index moodboard_nodes_file_id_idx on public.moodboard_nodes (file_id);

create table public.moodboard_edges (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  board_id uuid not null references public.moodboards (id) on delete cascade,
  source_node_id uuid not null references public.moodboard_nodes (id) on delete cascade,
  target_node_id uuid not null references public.moodboard_nodes (id) on delete cascade,
  style jsonb not null default '{}',
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_node_id <> target_node_id)
);

create index moodboard_edges_board_id_idx on public.moodboard_edges (board_id);
create index moodboard_edges_project_id_idx on public.moodboard_edges (project_id);
create index moodboard_edges_source_idx on public.moodboard_edges (source_node_id);
create index moodboard_edges_target_idx on public.moodboard_edges (target_node_id);

create table public.task_sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position text collate "C" not null,
  -- Tasks in a done column count as completed.
  is_done boolean not null default false,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index task_sections_project_id_idx on public.task_sections (project_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  -- No action rather than restrict, so deleting a project can cascade through
  -- columns and tasks in one statement.
  section_id uuid not null references public.task_sections (id),
  parent_task_id uuid references public.tasks (id) on delete cascade,
  assignee_id uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  labels text[] not null default '{}',
  start_at timestamptz,
  due_at timestamptz,
  -- Set and cleared by a trigger from the column the task sits in.
  completed_at timestamptz,
  position text collate "C" not null,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_task_id <> id)
);

create index tasks_project_id_idx on public.tasks (project_id);
create index tasks_section_id_idx on public.tasks (section_id);
create index tasks_parent_task_id_idx on public.tasks (parent_task_id);
create index tasks_assignee_due_idx on public.tasks (assignee_id, due_at) where completed_at is null;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'concept_folders', 'concepts', 'concept_beats', 'beat_items', 'moodboards',
    'moodboard_nodes', 'moodboard_edges', 'task_sections', 'tasks'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function private.set_updated_at()', t);
  end loop;
end;
$$;

-- Child rows take project_id from their parent, whatever the caller sent, and
-- can never move to another parent's project unnoticed. BEFORE triggers fire
-- in name order, so these are named to run ahead of the same-project checks.
create function private.set_project_id_from_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_project_id uuid;
begin
  execute format('select project_id from public.%I where id = $1', tg_argv[0])
    into v_project_id
    using (to_jsonb(new) ->> tg_argv[1])::uuid;
  if v_project_id is null then
    raise exception 'parent row not found' using errcode = '23503';
  end if;
  new.project_id := v_project_id;
  return new;
end;
$$;

create trigger a_set_project_id before insert or update on public.concept_beats
  for each row execute function private.set_project_id_from_parent('concepts', 'concept_id');
create trigger a_set_project_id before insert or update on public.beat_items
  for each row execute function private.set_project_id_from_parent('concept_beats', 'beat_id');
create trigger a_set_project_id before insert or update on public.moodboard_nodes
  for each row execute function private.set_project_id_from_parent('moodboards', 'board_id');
create trigger a_set_project_id before insert or update on public.moodboard_edges
  for each row execute function private.set_project_id_from_parent('moodboards', 'board_id');

-- References inside a project must stay inside it.
create function private.check_same_project() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ref uuid := (to_jsonb(new) ->> tg_argv[1])::uuid;
  v_project_id uuid;
begin
  if v_ref is null then
    return new;
  end if;
  execute format('select project_id from public.%I where id = $1', tg_argv[0])
    into v_project_id using v_ref;
  if v_project_id is distinct from new.project_id then
    raise exception '% belongs to another project', tg_argv[1] using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_folder_project before insert or update on public.concepts
  for each row execute function private.check_same_project('concept_folders', 'folder_id');
create trigger check_section_project before insert or update on public.tasks
  for each row execute function private.check_same_project('task_sections', 'section_id');
create trigger check_parent_project before insert or update on public.tasks
  for each row execute function private.check_same_project('tasks', 'parent_task_id');
create trigger check_file_project before insert or update on public.moodboard_nodes
  for each row execute function private.check_same_project('files', 'file_id');

-- A connector line joins two elements of its own board.
create function private.check_edge_board() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.moodboard_nodes n
      where n.id in (new.source_node_id, new.target_node_id)
        and n.board_id = new.board_id) <> 2 then
    raise exception 'both ends of a line must be on its board' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_edge_board before insert or update on public.moodboard_edges
  for each row execute function private.check_edge_board();

-- Rows never move to another project: their children would keep the old one.
create function private.forbid_project_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'a row cannot move to another project' using errcode = '23514';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'concept_folders', 'concepts', 'moodboards', 'task_sections', 'tasks'
  ] loop
    execute format(
      'create trigger forbid_project_change before update on public.%I
         for each row execute function private.forbid_project_change()', t);
  end loop;
end;
$$;

-- A task is completed exactly while it sits in a done column.
create function private.sync_task_completed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_done boolean;
begin
  select is_done into v_done from public.task_sections where id = new.section_id;
  if v_done then
    new.completed_at := coalesce(
      case when tg_op = 'UPDATE' then old.completed_at end, now());
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger sync_task_completed before insert or update on public.tasks
  for each row execute function private.sync_task_completed();

-- Marking a column done (or not) updates the tasks already in it.
create function private.resync_section_tasks() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_done is distinct from old.is_done then
    update public.tasks set section_id = section_id where section_id = new.id;
  end if;
  return new;
end;
$$;

create trigger resync_section_tasks after update on public.task_sections
  for each row execute function private.resync_section_tasks();

-- A new project starts with an empty active concept, a moodboard and the four
-- task columns.
create function private.seed_project_defaults(p_project_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.concepts (project_id, title, is_active, created_by)
  values (p_project_id, 'Treatment', true, p_user_id);
  insert into public.moodboards (project_id, title, created_by)
  values (p_project_id, 'Moodboard', p_user_id);
  insert into public.task_sections (project_id, name, color, position, is_done, created_by)
  values
    (p_project_id, 'Open', '#64748b', 'G', false, p_user_id),
    (p_project_id, 'In progress', '#2563eb', 'V', false, p_user_id),
    (p_project_id, 'Review', '#d97706', 'k', false, p_user_id),
    (p_project_id, 'Done', '#16a34a', 's', true, p_user_id);
end;
$$;

create function private.seed_new_project() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_project_defaults(new.id, new.created_by);
  return new;
end;
$$;

create trigger seed_new_project after insert on public.projects
  for each row execute function private.seed_new_project();

-- Projects created in phase 1 get the same defaults.
select private.seed_project_defaults(p.id, p.created_by)
from public.projects p
where not exists (select 1 from public.task_sections s where s.project_id = p.id);

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC functions
-- ---------------------------------------------------------------------------

-- Makes one concept the active one and deactivates the previous one in the
-- same transaction. Runs with the caller's rights, so RLS decides.
create function public.set_active_concept(p_concept_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_project_id uuid;
begin
  select project_id into v_project_id from public.concepts where id = p_concept_id;
  if v_project_id is null or not private.can_edit(v_project_id) then
    raise exception 'concept not found' using errcode = '42501';
  end if;
  update public.concepts set is_active = false
  where project_id = v_project_id and is_active and id <> p_concept_id;
  update public.concepts set is_active = true where id = p_concept_id;
end;
$$;

-- Lets the assignee complete or reopen their own task without being an
-- editor: moves it to the first done column, or back to the first open one.
create function public.set_task_completed(p_task_id uuid, p_completed boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
  v_section_id uuid;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found
     or not private.can_comment(v_task.project_id)
     or not (private.can_edit(v_task.project_id) or v_task.assignee_id = (select auth.uid())) then
    raise exception 'task not found' using errcode = '42501';
  end if;
  if (v_task.completed_at is not null) = p_completed then
    return;
  end if;
  select id into v_section_id
  from public.task_sections
  where project_id = v_task.project_id and is_done = p_completed
  order by position
  limit 1;
  if v_section_id is null then
    raise exception 'the board has no matching column' using errcode = 'P0002';
  end if;
  update public.tasks set section_id = v_section_id where id = p_task_id;
end;
$$;

revoke execute on function
  public.set_active_concept(uuid),
  public.set_task_completed(uuid, boolean)
from public, anon;
grant execute on function
  public.set_active_concept(uuid),
  public.set_task_completed(uuid, boolean)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'concept_folders', 'concepts', 'concept_beats', 'beat_items', 'moodboards',
    'moodboard_nodes', 'moodboard_edges', 'task_sections', 'tasks'
  ] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    -- Project tables: read with can_read, write with can_edit.
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
