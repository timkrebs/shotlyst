-- RLS on public.shotlist_columns (custom columns of the shot list and the
-- visibility of built-in ones): every project role reads, only editors (and
-- workspace admins) write.

begin;

select plan(35);

select tests.setup_workspace();
insert into public.shotlist_columns (id, project_id, key, label, type, position) values
  ('5c000000-0000-4000-8000-000000000001', tests.project_a(), 'vfx', 'VFX', 'checkbox', 'G'),
  ('5c000000-0000-4000-8000-000000000002', tests.project_a(), 'rig', 'Rig', 'text', 'V'),
  ('5c000000-0000-4000-8000-000000000003', tests.project_b(), 'vfx', 'VFX', 'checkbox', 'G');

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select key from public.shotlist_columns order by position',
  array['vfx', 'rig'], 'editor sees the columns of project A');
select tests.authenticate_as('commenter@tests.local');
select results_eq(
  'select key from public.shotlist_columns order by position',
  array['vfx', 'rig'], 'commenter sees the columns of project A');
select tests.authenticate_as('viewer@tests.local');
select results_eq(
  'select key from public.shotlist_columns order by position',
  array['vfx', 'rig'], 'viewer sees the columns of project A');
select tests.authenticate_as('outsider@tests.local');
select results_eq(
  'select id from public.shotlist_columns',
  array['5c000000-0000-4000-8000-000000000003'::uuid], 'outsider sees project B only');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.shotlist_columns), 3::bigint, 'admin sees every column');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.shotlist_columns', 'deactivated member sees no columns');
select tests.authenticate_as('stranger@tests.local');
select is_empty(
  'select id from public.shotlist_columns', 'user without a profile sees no columns');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.shotlist_columns (project_id, key, label, type, config, position)
     values (tests.project_a(), 'lens_kit', 'Lens kit', 'select',
             '{"options": ["Primes", "Zoom"]}', 'k') $$,
  'editor adds a column to project A');
select results_eq(
  $$ select visible, created_by from public.shotlist_columns where key = 'lens_kit' $$,
  $$ values (true, tests.uid('editor')) $$,
  'a new column is visible and created by the caller');
select throws_ok(
  $$ insert into public.shotlist_columns (project_id, key, label, type, position)
     values (tests.project_a(), 'vfx', 'VFX again', 'text', 's') $$,
  '23505', null, 'a column key is unique within a project');
select throws_ok(
  $$ insert into public.shotlist_columns (project_id, key, label, type, position)
     values (tests.project_a(), 'Bad Key', 'Bad', 'text', 's') $$,
  '23514', null, 'a column key is a lower-case identifier');
select throws_ok(
  $$ insert into public.shotlist_columns (project_id, key, label, type, position)
     values (tests.project_b(), 'rig', 'Rig', 'text', 's') $$,
  '42501', null, 'editor of project A cannot add a column to project B');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into public.shotlist_columns (project_id, key, label, type, position)
     values (tests.project_a(), 'x', 'X', 'text', 's') $$,
  '42501', null, 'commenter cannot add a column');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.shotlist_columns (project_id, key, label, type, position)
     values (tests.project_a(), 'x', 'X', 'text', 's') $$,
  '42501', null, 'viewer cannot add a column');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.shotlist_columns (project_id, key, label, type, position)
     values (tests.project_a(), 'x', 'X', 'text', 's') $$,
  '42501', null, 'outsider cannot add a column to project A');
select lives_ok(
  $$ insert into public.shotlist_columns (project_id, key, label, type, position)
     values (tests.project_b(), 'rig', 'Rig', 'text', 'V') $$,
  'outsider adds a column to project B');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.shotlist_columns (project_id, key, label, type, position, visible)
     values (tests.project_b(), 'lens', 'Lens', 'builtin', 'k', false) $$,
  'admin hides a built-in column without being a project member');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.shotlist_columns (project_id, key, label, type, position)
     values (tests.project_a(), 'x', 'X', 'text', 's') $$,
  '42501', null, 'deactivated editor cannot add a column');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.shotlist_columns set label = 'Visual effects', visible = false
     where id = '5c000000-0000-4000-8000-000000000001' returning id $$,
  'editor updates a column of project A');
select is_empty(
  $$ update public.shotlist_columns set label = 'hacked'
     where id = '5c000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot update a column of project B');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.shotlist_columns set label = 'hacked' returning id $$,
  'commenter cannot update columns');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.shotlist_columns set visible = false returning id $$,
  'viewer cannot update columns');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.shotlist_columns set label = 'hacked'
     where project_id = tests.project_a() returning id $$,
  'outsider cannot update columns of project A');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.shotlist_columns set label = 'Effects'
     where id = '5c000000-0000-4000-8000-000000000003' returning id $$,
  'admin updates a column of project B');

select tests.reset_role();
select results_eq(
  $$ select label, visible, project_id from public.shotlist_columns
     where id::text like '5c000000-%' order by id $$,
  $$ values ('Visual effects', false, tests.project_a()), ('Rig', true, tests.project_a()),
            ('Effects', true, tests.project_b()) $$,
  'only the allowed updates were stored');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  'delete from public.shotlist_columns returning id', 'viewer cannot delete columns');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  'delete from public.shotlist_columns returning id', 'commenter cannot delete columns');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.shotlist_columns where project_id = tests.project_a() returning id $$,
  'outsider cannot delete columns of project A');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ delete from public.shotlist_columns
     where id = '5c000000-0000-4000-8000-000000000001' returning id $$,
  'editor deletes a column of project A');
select is_empty(
  $$ delete from public.shotlist_columns
     where id = '5c000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot delete a column of project B');

select tests.reset_role();
select results_eq(
  $$ select project_id, count(*) from public.shotlist_columns
     group by project_id order by project_id $$,
  $$ values (tests.project_a(), 2::bigint), (tests.project_b(), 3::bigint) $$,
  'only the allowed delete took effect');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.shotlist_columns', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.shotlist_columns (project_id, key, label, type, position)
     values (tests.project_a(), 'anon', 'Anon', 'text', 'G') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.shotlist_columns set label = 'anon' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.shotlist_columns', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
