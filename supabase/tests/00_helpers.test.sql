-- Shared fixtures for the RLS tests. Sorts first so pg_prove runs it before
-- every other file. Unlike the other files it commits: it (re)creates the
-- `tests` schema that the other files call. Local and CI databases only.

begin;

set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;

select plan(3);

drop schema if exists tests cascade;
create schema tests;

-- Fixed IDs of the standard cast and the two projects.
create function tests.uid(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case p_name
    when 'owner' then 'c0000000-0000-4000-8000-000000000001'
    when 'admin' then 'c0000000-0000-4000-8000-000000000002'
    when 'editor' then 'c0000000-0000-4000-8000-000000000003'
    when 'commenter' then 'c0000000-0000-4000-8000-000000000004'
    when 'viewer' then 'c0000000-0000-4000-8000-000000000005'
    when 'outsider' then 'c0000000-0000-4000-8000-000000000006'
    when 'deactivated' then 'c0000000-0000-4000-8000-000000000007'
    when 'stranger' then 'c0000000-0000-4000-8000-000000000008'
  end::uuid;
$$;

create function tests.project_a() returns uuid
language sql immutable set search_path = '' as $$
  select 'a0000000-0000-4000-8000-00000000000a'::uuid;
$$;

create function tests.project_b() returns uuid
language sql immutable set search_path = '' as $$
  select 'b0000000-0000-4000-8000-00000000000b'::uuid;
$$;

-- Hash stored for an invitation token, as accept_invitation() computes it.
create function tests.token_hash(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_token, 'utf8')), 'hex');
$$;

-- Creates a confirmed auth user without a profile. Call as postgres.
create function tests.create_user(p_email text, p_id uuid default gen_random_uuid())
returns uuid
language plpgsql set search_path = '' as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    p_email, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );
  return p_id;
end;
$$;

-- Looks up a user while the caller runs as `authenticated` or `anon`.
create function tests.user_id(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where u.email = p_email;
$$;

-- Acts as the given user for the rest of the transaction. Not security
-- definer: such functions may not switch roles.
create function tests.authenticate_as(p_email text) returns void
language plpgsql set search_path = '' as $$
declare
  v_id uuid := tests.user_id(p_email);
begin
  if v_id is null then
    raise exception 'unknown test user %', p_email;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object(
    'sub', v_id, 'email', p_email, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
end;
$$;

create function tests.authenticate_anon() returns void
language plpgsql set search_path = '' as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Back to the session role (postgres), which bypasses RLS.
create function tests.reset_role() returns void
language plpgsql set search_path = '' as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Empties the public tables so seed data cannot leak into a test. Auth users
-- stay; without a profile they have no access.
create function tests.clear_workspace() returns void
language plpgsql set search_path = '' as $$
begin
  delete from public.activity_log;
  delete from public.invitations;
  delete from public.files;
  delete from public.project_members;
  delete from public.projects;
  delete from public.brands;
  delete from public.clients;
  delete from public.app_settings;
  delete from public.profiles;
  delete from public.login_attempts;
end;
$$;

-- Standard cast, all `<name>@tests.local`. Call as postgres inside the test
-- transaction; it starts from an empty workspace.
--   owner, admin   workspace roles; owner created both projects
--   editor, commenter, viewer   members holding that role in project A
--   outsider       member, editor of project B only
--   deactivated    member, editor of project A, deactivated
--   stranger       signed-in auth user without a profile
create function tests.setup_workspace() returns void
language plpgsql set search_path = '' as $$
declare
  v_name text;
begin
  perform tests.clear_workspace();

  foreach v_name in array array[
    'owner', 'admin', 'editor', 'commenter', 'viewer', 'outsider', 'deactivated', 'stranger'
  ] loop
    perform tests.create_user(v_name || '@tests.local', tests.uid(v_name));
    if v_name <> 'stranger' then
      insert into public.profiles (id, display_name, workspace_role, deactivated_at)
      values (
        tests.uid(v_name),
        initcap(v_name),
        case v_name when 'owner' then 'owner' when 'admin' then 'admin' else 'member' end
          ::public.workspace_role,
        case when v_name = 'deactivated' then now() end
      );
    end if;
  end loop;

  -- The add_project_creator trigger makes the owner an editor of both.
  insert into public.projects (id, name, project_number, created_by) values
    (tests.project_a(), 'Project A', 'T-001', tests.uid('owner')),
    (tests.project_b(), 'Project B', 'T-002', tests.uid('owner'));

  insert into public.project_members (project_id, user_id, role, added_by) values
    (tests.project_a(), tests.uid('editor'), 'editor', tests.uid('owner')),
    (tests.project_a(), tests.uid('commenter'), 'commenter', tests.uid('owner')),
    (tests.project_a(), tests.uid('viewer'), 'viewer', tests.uid('owner')),
    (tests.project_a(), tests.uid('deactivated'), 'editor', tests.uid('owner')),
    (tests.project_b(), tests.uid('outsider'), 'editor', tests.uid('owner'));
end;
$$;

grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

select has_function('tests', 'setup_workspace', 'fixture function exists');
select has_function('tests', 'authenticate_as', array['text'], 'role switch function exists');
select schema_privs_are('tests', 'authenticated', array['USAGE'],
  'authenticated may call the helpers');

select * from finish();

commit;
