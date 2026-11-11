-- RLS on public.clients: every active member reads and inserts; the creator or an
-- admin updates; only owner and admin delete.

begin;

select plan(31);

select tests.setup_workspace();
insert into public.clients (id, name, created_by) values
  ('d0000000-0000-4000-8000-000000000001', 'By editor', tests.uid('editor')),
  ('d0000000-0000-4000-8000-000000000002', 'By owner', tests.uid('owner')),
  ('d0000000-0000-4000-8000-000000000003', 'In use', tests.uid('owner'));
update public.projects set client_id = 'd0000000-0000-4000-8000-000000000003'
where id = tests.project_a();

-- select
select tests.authenticate_as('editor@tests.local');
select is((select count(*) from public.clients), 3::bigint, 'editor reads all clients');
select tests.authenticate_as('viewer@tests.local');
select is((select count(*) from public.clients), 3::bigint, 'viewer reads all clients');
select tests.authenticate_as('outsider@tests.local');
select is((select count(*) from public.clients), 3::bigint, 'outsider reads all clients');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.clients', 'deactivated member reads nothing');
select tests.authenticate_as('stranger@tests.local');
select is_empty('select id from public.clients', 'user without a profile reads nothing');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.clients (name) values ('New by editor') $$, 'editor inserts a client');
select throws_ok(
  $$ insert into public.clients (name, created_by) values ('Forged', tests.uid('owner')) $$,
  '42501', null, 'editor cannot insert a client in another name');
select tests.authenticate_as('viewer@tests.local');
select lives_ok(
  $$ insert into public.clients (name) values ('New by viewer') $$, 'viewer inserts a client');
select tests.authenticate_as('outsider@tests.local');
select lives_ok(
  $$ insert into public.clients (name) values ('New by outsider') $$, 'outsider inserts a client');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.clients (name) values ('New by deactivated') $$,
  '42501', null, 'deactivated member cannot insert a client');
select tests.authenticate_as('stranger@tests.local');
select throws_ok(
  $$ insert into public.clients (name) values ('New by stranger') $$,
  '42501', null, 'user without a profile cannot insert a client');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.clients set name = 'Renamed by editor'
     where id = 'd0000000-0000-4000-8000-000000000001' returning id $$,
  'editor updates their own client');
select is_empty(
  $$ update public.clients set name = 'Hacked'
     where id = 'd0000000-0000-4000-8000-000000000002' returning id $$,
  'editor cannot update a client created by someone else');
select throws_ok(
  $$ update public.clients set created_by = tests.uid('viewer')
     where id = 'd0000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'editor cannot hand their client to someone else');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.clients set name = 'Hacked'
     where id = 'd0000000-0000-4000-8000-000000000001' returning id $$,
  'viewer cannot update a client created by someone else');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.clients set name = 'Hacked'
     where id = 'd0000000-0000-4000-8000-000000000001' returning id $$,
  'outsider cannot update a client created by someone else');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.clients set name = 'Renamed by admin'
     where id = 'd0000000-0000-4000-8000-000000000002' returning id $$,
  'admin updates a client created by someone else');

select tests.reset_role();
select results_eq(
  $$ select name from public.clients where id in (
       'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002')
     order by id $$,
  array['Renamed by editor', 'Renamed by admin'],
  'only the allowed updates were stored');

-- delete
select tests.authenticate_as('editor@tests.local');
select is_empty(
  'delete from public.clients returning id', 'editor cannot delete clients, not even their own');
select tests.authenticate_as('viewer@tests.local');
select is_empty('delete from public.clients returning id', 'viewer cannot delete clients');
select tests.authenticate_as('outsider@tests.local');
select is_empty('delete from public.clients returning id', 'outsider cannot delete clients');
select tests.reset_role();
select is((select count(*) from public.clients), 6::bigint, 'all clients survived');

select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ delete from public.clients where id = 'd0000000-0000-4000-8000-000000000001' returning id $$,
  'admin deletes a client');
select throws_ok(
  $$ delete from public.clients where id = 'd0000000-0000-4000-8000-000000000003' $$,
  '23503', null, 'a client used by a project cannot be deleted');
select tests.authenticate_as('owner@tests.local');
select isnt_empty(
  $$ delete from public.clients where id = 'd0000000-0000-4000-8000-000000000002' returning id $$,
  'owner deletes a client');
select tests.reset_role();
select is((select count(*) from public.clients), 4::bigint, 'only the admin deletes took effect');
select is(
  (select client_id from public.projects where id = tests.project_a()),
  'd0000000-0000-4000-8000-000000000003'::uuid,
  'the project keeps its client');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.clients', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.clients (name) values ('Anon') $$, '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.clients set name = 'Anon' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.clients', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
