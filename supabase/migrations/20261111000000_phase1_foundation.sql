-- Phase 1: workspace and access, library basics (brands, clients), projects,
-- project members, invitations, files, activity log, storage.
--
-- Access is decided here, not in the UI. Policies call the helper functions in
-- the `private` schema, which PostgREST does not expose.

create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create type public.workspace_role as enum ('owner', 'admin', 'member');
create type public.project_role as enum ('editor', 'commenter', 'viewer');
create type public.project_kind as enum ('short_form', 'narrative');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per auth user. Rows are created only by claim_ownership() and
-- accept_invitation(); there is no insert policy.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_file_id uuid,
  color text not null default '#4f46e5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  workspace_role public.workspace_role not null default 'member',
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exactly one owner.
create unique index profiles_single_owner
  on public.profiles ((true)) where workspace_role = 'owner';

create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text,
  industry text,
  tone text,
  target_audience text,
  no_gos text,
  website text,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text,
  phone text,
  note text,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  project_number text not null unique,
  kind public.project_kind not null default 'short_form',
  description text,
  -- Library rows are never cascade-deleted.
  brand_id uuid references public.brands (id) on delete restrict,
  client_id uuid references public.clients (id) on delete restrict,
  aspect_ratio text not null default '16:9'
    check (aspect_ratio in ('16:9', '9:16', '1:1', '4:5', '2.39:1')),
  timezone text not null default 'UTC',
  budget_cents integer check (budget_cents >= 0),
  status text not null default 'planning'
    check (status in ('planning', 'production', 'post', 'done')),
  cover_file_id uuid,
  position text not null default 'a0',
  archived_at timestamptz,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_brand_id_idx on public.projects (brand_id);
create index projects_client_id_idx on public.projects (client_id);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.project_role not null,
  added_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index project_members_user_id_idx on public.project_members (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  workspace_role public.workspace_role not null default 'member'
    check (workspace_role <> 'owner'),
  project_id uuid references public.projects (id) on delete cascade,
  project_role public.project_role,
  -- SHA-256 of the token in the invitation link; the token itself is not stored.
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  invited_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((project_id is null) = (project_role is null))
);

create unique index invitations_one_pending_per_email
  on public.invitations (email) where accepted_at is null;
create index invitations_project_id_idx on public.invitations (project_id);

-- File library and pointer into storage. project_id is null for library media
-- (avatars), whose paths start with `library/`.
create table public.files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  bucket text not null default 'media',
  path text not null,
  name text not null check (char_length(name) between 1 and 255),
  mime text not null,
  size bigint not null check (size >= 0),
  width integer,
  height integer,
  folder text,
  kind text not null default 'file' check (kind in ('image', 'pdf', 'video', 'file')),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, path),
  -- The first path segment decides who may touch the object in storage.
  check (path like coalesce(project_id::text, 'library') || '/%')
);

create index files_project_id_idx on public.files (project_id);

alter table public.profiles
  add constraint profiles_avatar_file_id_fkey
  foreign key (avatar_file_id) references public.files (id) on delete set null;
alter table public.projects
  add constraint projects_cover_file_id_fkey
  foreign key (cover_file_id) references public.files (id) on delete set null;

-- Who changed what. project_id is null for workspace-level events.
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  actor_id uuid references public.profiles (id) default auth.uid(),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index activity_log_project_id_idx on public.activity_log (project_id, created_at desc);

-- Failed sign-ins per client key (a keyed hash of the IP). Reached only
-- through the two functions below; no policy grants direct access.
create table public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index login_attempts_key_idx on public.login_attempts (key, created_at);

-- ---------------------------------------------------------------------------
-- Helper functions for policies
-- ---------------------------------------------------------------------------

create function private.is_active_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.deactivated_at is null
  );
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.deactivated_at is null
      and p.workspace_role in ('owner', 'admin')
  );
$$;

create function private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.deactivated_at is null
      and p.workspace_role = 'owner'
  );
$$;

-- True when the caller holds one of the given roles in the project. Owner and
-- admin act as editor everywhere.
create function private.has_project_role(p_project_id uuid, p_roles public.project_role[])
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects where id = p_project_id) and (
    private.is_admin()
    or exists (
      select 1
      from public.project_members m
      join public.profiles p on p.id = m.user_id
      where m.project_id = p_project_id
        and m.user_id = (select auth.uid())
        and m.role = any (p_roles)
        and p.deactivated_at is null
    )
  );
$$;

create function private.can_read(p_project_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_project_role(
    p_project_id, array['editor', 'commenter', 'viewer']::public.project_role[]);
$$;

create function private.can_comment(p_project_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_project_role(
    p_project_id, array['editor', 'commenter']::public.project_role[]);
$$;

create function private.can_edit(p_project_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_project_role(p_project_id, array['editor']::public.project_role[]);
$$;

-- Project ID from the first segment of a storage object name, or null when
-- that segment is not a UUID (for example `library`).
create function private.storage_project_id(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case
    when split_part(p_name, '/', 1)
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;


-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'app_settings', 'brands', 'clients', 'projects', 'project_members',
    'invitations', 'files', 'activity_log', 'login_attempts'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function private.set_updated_at()', t);
  end loop;
end;
$$;

-- API callers may edit only their own name, avatar and colour. Role and
-- deactivation changes need an admin and never touch the owner; ownership
-- moves only through transfer_ownership(). Security-definer functions and the
-- service role run as another database role and pass through.
create function private.guard_profile_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.id is distinct from old.id then
    raise exception 'a profile cannot change its user' using errcode = '42501';
  end if;
  if old.id <> (select auth.uid())
     and (new.display_name is distinct from old.display_name
          or new.color is distinct from old.color
          or new.avatar_file_id is distinct from old.avatar_file_id) then
    raise exception 'only the member may edit their own profile' using errcode = '42501';
  end if;
  if new.workspace_role is distinct from old.workspace_role
     or new.deactivated_at is distinct from old.deactivated_at then
    if not private.is_admin() then
      raise exception 'only owner or admin may change roles' using errcode = '42501';
    end if;
    if old.id = (select auth.uid()) then
      raise exception 'you cannot change your own role or status' using errcode = '42501';
    end if;
    if old.workspace_role = 'owner' or new.workspace_role = 'owner' then
      raise exception 'the owner changes only through an ownership transfer'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_profile_update before update on public.profiles
  for each row execute function private.guard_profile_update();

-- The person who creates a project becomes its editor.
create function private.add_project_creator() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.created_by is not null then
    insert into public.project_members (project_id, user_id, role, added_by)
    values (new.id, new.created_by, 'editor', new.created_by)
    on conflict (project_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger add_project_creator after insert on public.projects
  for each row execute function private.add_project_creator();

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC functions
-- ---------------------------------------------------------------------------

-- First login of an empty workspace: the caller becomes owner. The server
-- calls this only for the account whose email equals OWNER_EMAIL; with public
-- sign-up off, the only other accounts are ones created in the dashboard.
create function public.claim_ownership(p_display_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  -- Only a workspace without any profile can be claimed, and never by an
  -- account that came in through an invitation.
  if exists (select 1 from public.profiles) then
    raise exception 'the workspace already has an owner' using errcode = '42501';
  end if;
  if exists (select 1 from auth.users u where u.id = v_uid and u.invited_at is not null) then
    raise exception 'invited accounts cannot claim the workspace' using errcode = '42501';
  end if;
  insert into public.profiles (id, display_name, workspace_role)
  values (
    v_uid,
    coalesce(nullif(trim(p_display_name), ''), split_part((select auth.email()), '@', 1)),
    'owner'
  );
end;
$$;

-- Accepts the invitation behind a token for the signed-in user: creates the
-- profile, applies the roles and marks the invitation accepted, atomically.
create function public.accept_invitation(p_token text, p_display_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_invitation public.invitations;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'this account is already a member' using errcode = 'P0002';
  end if;

  select * into v_invitation
  from public.invitations i
  where i.token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex')
    and i.accepted_at is null
    and i.expires_at > now()
    and i.email = lower((select auth.email()))
  for update;

  if not found then
    raise exception 'invitation is invalid or expired' using errcode = 'P0002';
  end if;

  insert into public.profiles (id, display_name, workspace_role)
  values (v_uid, trim(p_display_name), v_invitation.workspace_role);

  if v_invitation.project_id is not null then
    insert into public.project_members (project_id, user_id, role, added_by)
    values (v_invitation.project_id, v_uid, v_invitation.project_role, v_invitation.invited_by);
  end if;

  update public.invitations set accepted_at = now() where id = v_invitation.id;

  insert into public.activity_log (project_id, actor_id, action, entity_type, entity_id, summary)
  values (v_invitation.project_id, v_uid, 'invitation.accepted', 'invitation', v_invitation.id,
          trim(p_display_name) || ' accepted an invitation');
end;
$$;

-- Hands the workspace to another active member; the caller becomes admin.
create function public.transfer_ownership(p_new_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not private.is_owner() then
    raise exception 'only the owner may transfer ownership' using errcode = '42501';
  end if;
  if p_new_owner = v_uid or not exists (
    select 1 from public.profiles where id = p_new_owner and deactivated_at is null
  ) then
    raise exception 'the new owner must be another active member' using errcode = '22023';
  end if;
  update public.profiles set workspace_role = 'admin' where id = v_uid;
  update public.profiles set workspace_role = 'owner' where id = p_new_owner;
end;
$$;

-- Member directory for Settings -> Members, with the fields that live in
-- auth.users. Owner and admin only.
create function public.list_members()
returns table (
  id uuid,
  email text,
  display_name text,
  color text,
  avatar_file_id uuid,
  workspace_role public.workspace_role,
  deactivated_at timestamptz,
  last_sign_in_at timestamptz,
  project_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'only owner or admin may list members' using errcode = '42501';
  end if;
  return query
    select p.id, u.email::text, p.display_name, p.color, p.avatar_file_id, p.workspace_role,
           p.deactivated_at, u.last_sign_in_at,
           (select count(*) from public.project_members m where m.user_id = p.id)
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at;
end;
$$;

-- Suggests the next project number of the current year, e.g. 2026-001. Counts
-- every project, including those the caller cannot read.
create function public.next_project_number() returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_last integer;
begin
  if not private.is_active_member() then
    raise exception 'not a member' using errcode = '42501';
  end if;
  select coalesce(max(substring(project_number from 6)::integer), 0) into v_last
  from public.projects
  where project_number ~ ('^' || v_year || '-[0-9]{1,6}$');
  return v_year || '-' || lpad((v_last + 1)::text, 3, '0');
end;
$$;

-- Sign-in throttle: five failures per key lock sign-in for 15 minutes.
create function public.login_allowed(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) < 5
  from public.login_attempts a
  where a.key = p_key and a.created_at > now() - interval '15 minutes';
$$;

create function public.record_login_failure(p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.login_attempts where created_at < now() - interval '1 day';
  -- Past the lock threshold more rows change nothing, so stop storing them.
  if (select count(*) from public.login_attempts a
      where a.key = left(p_key, 128) and a.created_at > now() - interval '15 minutes') < 5 then
    insert into public.login_attempts (key) values (left(p_key, 128));
  end if;
end;
$$;

revoke execute on function
  public.claim_ownership(text),
  public.accept_invitation(text, text),
  public.transfer_ownership(uuid),
  public.list_members(),
  public.next_project_number(),
  public.login_allowed(text),
  public.record_login_failure(text)
from public, anon;

grant execute on function
  public.claim_ownership(text),
  public.accept_invitation(text, text),
  public.transfer_ownership(uuid),
  public.list_members(),
  public.next_project_number()
to authenticated, service_role;

grant execute on function
  public.login_allowed(text),
  public.record_login_failure(text)
to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ---------------------------------------------------------------------------

-- Nothing is reachable without a session: the anonymous role has no table
-- privileges at all, and every policy below targets `authenticated`.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
revoke all on public.login_attempts from authenticated;

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.brands enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.invitations enable row level security;
alter table public.files enable row level security;
alter table public.activity_log enable row level security;
alter table public.login_attempts enable row level security;

-- profiles: members see each other; a deactivated user still sees their own
-- row so the app can explain why access ended.
create policy profiles_select on public.profiles for select to authenticated
  using ((select private.is_active_member()) or id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using ((select private.is_active_member())
         and (id = (select auth.uid()) or (select private.is_admin())))
  with check ((select private.is_active_member())
              and (id = (select auth.uid()) or (select private.is_admin())));

-- app_settings: everyone reads, owner and admin write.
create policy app_settings_select on public.app_settings for select to authenticated
  using ((select private.is_active_member()));
create policy app_settings_insert on public.app_settings for insert to authenticated
  with check ((select private.is_admin()));
create policy app_settings_update on public.app_settings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy app_settings_delete on public.app_settings for delete to authenticated
  using ((select private.is_admin()));

-- Library tables: any active member reads and inserts; update by creator or
-- admin; delete by admin.
create policy brands_select on public.brands for select to authenticated
  using ((select private.is_active_member()));
create policy brands_insert on public.brands for insert to authenticated
  with check ((select private.is_active_member()) and created_by = (select auth.uid()));
create policy brands_update on public.brands for update to authenticated
  using ((select private.is_active_member())
         and (created_by = (select auth.uid()) or (select private.is_admin())))
  with check ((select private.is_active_member())
              and (created_by = (select auth.uid()) or (select private.is_admin())));
create policy brands_delete on public.brands for delete to authenticated
  using ((select private.is_admin()));

create policy clients_select on public.clients for select to authenticated
  using ((select private.is_active_member()));
create policy clients_insert on public.clients for insert to authenticated
  with check ((select private.is_active_member()) and created_by = (select auth.uid()));
create policy clients_update on public.clients for update to authenticated
  using ((select private.is_active_member())
         and (created_by = (select auth.uid()) or (select private.is_admin())))
  with check ((select private.is_active_member())
              and (created_by = (select auth.uid()) or (select private.is_admin())));
create policy clients_delete on public.clients for delete to authenticated
  using ((select private.is_admin()));

-- projects: any active member creates; afterwards the project roles decide.
create policy projects_select on public.projects for select to authenticated
  using (private.can_read(id));
create policy projects_insert on public.projects for insert to authenticated
  with check ((select private.is_active_member()) and created_by = (select auth.uid()));
create policy projects_update on public.projects for update to authenticated
  using (private.can_edit(id)) with check (private.can_edit(id));
create policy projects_delete on public.projects for delete to authenticated
  using (private.can_edit(id));

-- project_members: readable inside the project, managed by editors.
create policy project_members_select on public.project_members for select to authenticated
  using (private.can_read(project_id));
create policy project_members_insert on public.project_members for insert to authenticated
  with check (private.can_edit(project_id));
create policy project_members_update on public.project_members for update to authenticated
  using (private.can_edit(project_id)) with check (private.can_edit(project_id));
create policy project_members_delete on public.project_members for delete to authenticated
  using (private.can_edit(project_id));

-- invitations: owner and admin only.
create policy invitations_select on public.invitations for select to authenticated
  using ((select private.is_admin()));
create policy invitations_insert on public.invitations for insert to authenticated
  with check ((select private.is_admin()) and invited_by = (select auth.uid()));
create policy invitations_update on public.invitations for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy invitations_delete on public.invitations for delete to authenticated
  using ((select private.is_admin()));

-- files: project files follow the project roles; library files (project_id
-- null) are readable by every member and changed by their uploader or an admin.
create policy files_select on public.files for select to authenticated
  using (case when project_id is null
              then (select private.is_active_member())
              else private.can_read(project_id) end);
create policy files_insert on public.files for insert to authenticated
  with check (created_by = (select auth.uid())
              and case when project_id is null
                       then (select private.is_active_member())
                       else private.can_edit(project_id) end);
create policy files_update on public.files for update to authenticated
  using (case when project_id is null
              then (select private.is_active_member())
                   and (created_by = (select auth.uid()) or (select private.is_admin()))
              else private.can_edit(project_id) end)
  with check (case when project_id is null
                   then (select private.is_active_member())
                        and (created_by = (select auth.uid()) or (select private.is_admin()))
                   else private.can_edit(project_id) end);
create policy files_delete on public.files for delete to authenticated
  using (case when project_id is null
              then (select private.is_active_member())
                   and (created_by = (select auth.uid()) or (select private.is_admin()))
              else private.can_edit(project_id) end);

-- activity_log: append-only. Project events are readable in the project,
-- workspace events by owner and admin.
create policy activity_log_select on public.activity_log for select to authenticated
  using (case when project_id is null
              then (select private.is_admin())
              else private.can_read(project_id) end);
create policy activity_log_insert on public.activity_log for insert to authenticated
  with check (actor_id = (select auth.uid())
              and case when project_id is null
                       then (select private.is_active_member())
                       else private.can_read(project_id) end);

-- login_attempts: no policies. Only the security-definer functions reach it.

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

-- Private bucket for images and files. Object names start with the project ID
-- or with `library`; the policies check that first segment.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 52428800)
on conflict (id) do nothing;

create policy media_select on storage.objects for select to authenticated
  using (bucket_id = 'media'
         and case when split_part(name, '/', 1) = 'library'
                  then (select private.is_active_member())
                  else private.can_read(private.storage_project_id(name)) end);
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media'
              and case when split_part(name, '/', 1) = 'library'
                       then (select private.is_active_member())
                       else private.can_edit(private.storage_project_id(name)) end);
create policy media_update on storage.objects for update to authenticated
  using (bucket_id = 'media'
         and case when split_part(name, '/', 1) = 'library'
                  then (select private.is_active_member())
                       and (owner_id = (select auth.uid())::text or (select private.is_admin()))
                  else private.can_edit(private.storage_project_id(name)) end)
  with check (bucket_id = 'media'
              and case when split_part(name, '/', 1) = 'library'
                       then (select private.is_active_member())
                       else private.can_edit(private.storage_project_id(name)) end);
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media'
         and case when split_part(name, '/', 1) = 'library'
                  then (select private.is_active_member())
                       and (owner_id = (select auth.uid())::text or (select private.is_admin()))
                  else private.can_edit(private.storage_project_id(name)) end);
