-- RLS on public.brands: every active member reads and inserts; the creator or an
-- admin updates; only owner and admin delete.

begin;

select plan(31);

select tests.setup_workspace();
insert into public.brands (id, name, created_by) values
  ('d0000000-0000-4000-8000-000000000001', 'By editor', tests.uid('editor')),
  ('d0000000-0000-4000-8000-000000000002', 'By owner', tests.uid('owner')),
  ('d0000000-0000-4000-8000-000000000003', 'In use', tests.uid('owner'));
update public.projects set brand_id = 'd0000000-0000-4000-8000-000000000003'
where id = tests.project_a();

-- select
select tests.authenticate_as('editor@tests.local');
select is((select count(*) from public.brands), 3::bigint, 'editor reads all brands');
select tests.authenticate_as('viewer@tests.local');
select is((select count(*) from public.brands), 3::bigint, 'viewer reads all brands');
select tests.authenticate_as('outsider@tests.local');
select is((select count(*) from public.brands), 3::bigint, 'outsider reads all brands');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.brands', 'deactivated member reads nothing');
select tests.authenticate_as('stranger@tests.local');
select is_empty('select id from public.brands', 'user without a profile reads nothing');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.brands (name) values ('New by editor') $$, 'editor inserts a brand');
select throws_ok(
  $$ insert into public.brands (name, created_by) values ('Forged', tests.uid('owner')) $$,
  '42501', null, 'editor cannot insert a brand in another name');
select tests.authenticate_as('viewer@tests.local');
select lives_ok(
  $$ insert into public.brands (name) values ('New by viewer') $$, 'viewer inserts a brand');
select tests.authenticate_as('outsider@tests.local');
select lives_ok(
  $$ insert into public.brands (name) values ('New by outsider') $$, 'outsider inserts a brand');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.brands (name) values ('New by deactivated') $$,
  '42501', null, 'deactivated member cannot insert a brand');
select tests.authenticate_as('stranger@tests.local');
select throws_ok(
  $$ insert into public.brands (name) values ('New by stranger') $$,
  '42501', null, 'user without a profile cannot insert a brand');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.brands set name = 'Renamed by editor'
     where id = 'd0000000-0000-4000-8000-000000000001' returning id $$,
  'editor updates their own brand');
select is_empty(
  $$ update public.brands set name = 'Hacked'
     where id = 'd0000000-0000-4000-8000-000000000002' returning id $$,
  'editor cannot update a brand created by someone else');
select throws_ok(
  $$ update public.brands set created_by = tests.uid('viewer')
     where id = 'd0000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'editor cannot hand their brand to someone else');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.brands set name = 'Hacked'
     where id = 'd0000000-0000-4000-8000-000000000001' returning id $$,
  'viewer cannot update a brand created by someone else');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.brands set name = 'Hacked'
     where id = 'd0000000-0000-4000-8000-000000000001' returning id $$,
  'outsider cannot update a brand created by someone else');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.brands set name = 'Renamed by admin'
     where id = 'd0000000-0000-4000-8000-000000000002' returning id $$,
  'admin updates a brand created by someone else');

select tests.reset_role();
select results_eq(
  $$ select name from public.brands where id in (
       'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002')
     order by id $$,
  array['Renamed by editor', 'Renamed by admin'],
  'only the allowed updates were stored');

-- delete
select tests.authenticate_as('editor@tests.local');
select is_empty(
  'delete from public.brands returning id', 'editor cannot delete brands, not even their own');
select tests.authenticate_as('viewer@tests.local');
select is_empty('delete from public.brands returning id', 'viewer cannot delete brands');
select tests.authenticate_as('outsider@tests.local');
select is_empty('delete from public.brands returning id', 'outsider cannot delete brands');
select tests.reset_role();
select is((select count(*) from public.brands), 6::bigint, 'all brands survived');

select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ delete from public.brands where id = 'd0000000-0000-4000-8000-000000000001' returning id $$,
  'admin deletes a brand');
select throws_ok(
  $$ delete from public.brands where id = 'd0000000-0000-4000-8000-000000000003' $$,
  '23503', null, 'a brand used by a project cannot be deleted');
select tests.authenticate_as('owner@tests.local');
select isnt_empty(
  $$ delete from public.brands where id = 'd0000000-0000-4000-8000-000000000002' returning id $$,
  'owner deletes a brand');
select tests.reset_role();
select is((select count(*) from public.brands), 4::bigint, 'only the admin deletes took effect');
select is(
  (select brand_id from public.projects where id = tests.project_a()),
  'd0000000-0000-4000-8000-000000000003'::uuid,
  'the project keeps its brand');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.brands', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.brands (name) values ('Anon') $$, '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.brands set name = 'Anon' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.brands', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
