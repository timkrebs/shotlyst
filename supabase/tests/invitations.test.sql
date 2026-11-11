-- RLS on public.invitations: owner and admin only.

begin;

select plan(27);

select tests.setup_workspace();
insert into public.invitations (id, email, token_hash, expires_at, invited_by) values
  ('e0000000-0000-4000-8000-000000000001', 'pending@tests.local',
   tests.token_hash('pending-token'), now() + interval '7 days', tests.uid('owner'));

-- select
select tests.authenticate_as('editor@tests.local');
select is_empty('select id from public.invitations', 'editor sees no invitations');
select tests.authenticate_as('viewer@tests.local');
select is_empty('select id from public.invitations', 'viewer sees no invitations');
select tests.authenticate_as('outsider@tests.local');
select is_empty('select id from public.invitations', 'outsider sees no invitations');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.invitations), 1::bigint, 'admin sees invitations');
select tests.authenticate_as('owner@tests.local');
select is((select count(*) from public.invitations), 1::bigint, 'owner sees invitations');

-- insert
select tests.authenticate_as('editor@tests.local');
select throws_ok(
  $$ insert into public.invitations (email, token_hash, expires_at, project_id, project_role)
     values ('by-editor@tests.local', 'h-editor', now() + interval '1 day',
             tests.project_a(), 'viewer') $$,
  '42501', null, 'editor cannot invite, not even into their own project');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.invitations (email, token_hash, expires_at)
     values ('by-viewer@tests.local', 'h-viewer', now() + interval '1 day') $$,
  '42501', null, 'viewer cannot invite');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.invitations (email, token_hash, expires_at)
     values ('by-outsider@tests.local', 'h-outsider', now() + interval '1 day') $$,
  '42501', null, 'outsider cannot invite');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.invitations (email, token_hash, expires_at, project_id, project_role)
     values ('by-admin@tests.local', 'h-admin', now() + interval '1 day',
             tests.project_a(), 'viewer') $$,
  'admin invites');
select throws_ok(
  $$ insert into public.invitations (email, token_hash, expires_at, invited_by)
     values ('forged@tests.local', 'h-forged', now() + interval '1 day', tests.uid('owner')) $$,
  '42501', null, 'admin cannot invite in another name');
select throws_ok(
  $$ insert into public.invitations (email, workspace_role, token_hash, expires_at)
     values ('second-owner@tests.local', 'owner', 'h-owner', now() + interval '1 day') $$,
  '23514', null, 'nobody can be invited as owner');
select throws_ok(
  $$ insert into public.invitations (email, token_hash, expires_at)
     values ('pending@tests.local', 'h-dup', now() + interval '1 day') $$,
  '23505', null, 'one pending invitation per email');
select tests.authenticate_as('owner@tests.local');
select lives_ok(
  $$ insert into public.invitations (email, workspace_role, token_hash, expires_at)
     values ('by-owner@tests.local', 'admin', 'h-by-owner', now() + interval '1 day') $$,
  'owner invites an admin');

-- update
select tests.authenticate_as('editor@tests.local');
select is_empty(
  $$ update public.invitations set expires_at = now() + interval '1 year' returning id $$,
  'editor cannot update invitations');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.invitations set expires_at = now() + interval '1 year' returning id $$,
  'viewer cannot update invitations');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.invitations set expires_at = now() + interval '1 year' returning id $$,
  'outsider cannot update invitations');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.invitations set workspace_role = 'admin'
     where id = 'e0000000-0000-4000-8000-000000000001' returning id $$,
  'admin updates an invitation');

-- delete
select tests.authenticate_as('editor@tests.local');
select is_empty('delete from public.invitations returning id',
  'editor cannot delete invitations');
select tests.authenticate_as('viewer@tests.local');
select is_empty('delete from public.invitations returning id',
  'viewer cannot delete invitations');
select tests.authenticate_as('outsider@tests.local');
select is_empty('delete from public.invitations returning id',
  'outsider cannot delete invitations');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ delete from public.invitations where email = 'by-owner@tests.local' returning id $$,
  'admin revokes an invitation');
select tests.authenticate_as('owner@tests.local');
select isnt_empty(
  $$ delete from public.invitations where email = 'by-admin@tests.local' returning id $$,
  'owner revokes an invitation');

select tests.reset_role();
select results_eq(
  'select email, workspace_role::text from public.invitations',
  $$ values ('pending@tests.local', 'admin') $$,
  'only the admin changes were stored');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.invitations', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.invitations (email, token_hash, expires_at)
     values ('anon@tests.local', 'h-anon', now() + interval '1 day') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.invitations set accepted_at = now() $$, '42501', null,
  'anon cannot update');
select throws_ok('delete from public.invitations', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
