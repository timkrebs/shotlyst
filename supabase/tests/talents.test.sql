-- RLS on public.talents (library): every active member reads and inserts; the
-- creator or an admin updates; only owner and admin delete.

begin;

select plan(31);

select tests.setup_workspace();
insert into public.talents (id, name, created_by) values
  ('7a000000-0000-4000-8000-000000000001', 'By editor', tests.uid('editor')),
  ('7a000000-0000-4000-8000-000000000002', 'By owner', tests.uid('owner')),
  ('7a000000-0000-4000-8000-000000000003', 'In use', tests.uid('owner'));
insert into public.shots (id, segment_id, position) values
  ('50000000-0000-4000-8000-000000000001', tests.segment_id(tests.project_a()), 'G');
insert into public.shot_talents (shot_id, talent_id) values
  ('50000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000003');

-- select
select tests.authenticate_as('editor@tests.local');
select is((select count(*) from public.talents), 3::bigint, 'editor reads all talents');
select tests.authenticate_as('viewer@tests.local');
select is((select count(*) from public.talents), 3::bigint, 'viewer reads all talents');
select tests.authenticate_as('outsider@tests.local');
select is((select count(*) from public.talents), 3::bigint, 'outsider reads all talents');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.talents', 'deactivated member reads nothing');
select tests.authenticate_as('stranger@tests.local');
select is_empty('select id from public.talents', 'user without a profile reads nothing');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.talents (name) values ('New by editor') $$, 'editor inserts a talent');
select throws_ok(
  $$ insert into public.talents (name, created_by) values ('Forged', tests.uid('owner')) $$,
  '42501', null, 'editor cannot insert a talent in another name');
select tests.authenticate_as('viewer@tests.local');
select lives_ok(
  $$ insert into public.talents (name) values ('New by viewer') $$, 'viewer inserts a talent');
select tests.authenticate_as('outsider@tests.local');
select lives_ok(
  $$ insert into public.talents (name) values ('New by outsider') $$, 'outsider inserts a talent');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.talents (name) values ('New by deactivated') $$,
  '42501', null, 'deactivated member cannot insert a talent');
select tests.authenticate_as('stranger@tests.local');
select throws_ok(
  $$ insert into public.talents (name) values ('New by stranger') $$,
  '42501', null, 'user without a profile cannot insert a talent');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.talents set name = 'Renamed by editor'
     where id = '7a000000-0000-4000-8000-000000000001' returning id $$,
  'editor updates their own talent');
select is_empty(
  $$ update public.talents set name = 'Hacked'
     where id = '7a000000-0000-4000-8000-000000000002' returning id $$,
  'editor cannot update a talent created by someone else');
select throws_ok(
  $$ update public.talents set created_by = tests.uid('viewer')
     where id = '7a000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'editor cannot hand their talent to someone else');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.talents set name = 'Hacked'
     where id = '7a000000-0000-4000-8000-000000000001' returning id $$,
  'viewer cannot update a talent created by someone else');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.talents set name = 'Hacked'
     where id = '7a000000-0000-4000-8000-000000000001' returning id $$,
  'outsider cannot update a talent created by someone else');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.talents set name = 'Renamed by admin'
     where id = '7a000000-0000-4000-8000-000000000002' returning id $$,
  'admin updates a talent created by someone else');

select tests.reset_role();
select results_eq(
  $$ select name from public.talents where id in (
       '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000002')
     order by id $$,
  array['Renamed by editor', 'Renamed by admin'],
  'only the allowed updates were stored');

-- delete
select tests.authenticate_as('editor@tests.local');
select is_empty(
  'delete from public.talents returning id', 'editor cannot delete talents, not even their own');
select tests.authenticate_as('viewer@tests.local');
select is_empty('delete from public.talents returning id', 'viewer cannot delete talents');
select tests.authenticate_as('outsider@tests.local');
select is_empty('delete from public.talents returning id', 'outsider cannot delete talents');
select tests.reset_role();
select is((select count(*) from public.talents), 6::bigint, 'all talents survived');

select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ delete from public.talents where id = '7a000000-0000-4000-8000-000000000001' returning id $$,
  'admin deletes a talent');
select throws_ok(
  $$ delete from public.talents where id = '7a000000-0000-4000-8000-000000000003' $$,
  '23503', null, 'a talent used by a shot cannot be deleted');
select tests.authenticate_as('owner@tests.local');
select isnt_empty(
  $$ delete from public.talents where id = '7a000000-0000-4000-8000-000000000002' returning id $$,
  'owner deletes a talent');
select tests.reset_role();
select is((select count(*) from public.talents), 4::bigint, 'only the admin deletes took effect');
select is(
  (select talent_id from public.shot_talents
   where shot_id = '50000000-0000-4000-8000-000000000001'),
  '7a000000-0000-4000-8000-000000000003'::uuid,
  'the shot keeps its talent');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.talents', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.talents (name) values ('Anon') $$, '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.talents set name = 'Anon' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.talents', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
