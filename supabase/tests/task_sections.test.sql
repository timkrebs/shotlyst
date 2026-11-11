-- RLS on public.task_sections: every project role reads, only editors (and
-- workspace admins) write. Each project starts with the four seeded columns
-- Open, In progress, Review and Done.

begin;

select plan(36);

select tests.setup_workspace();
insert into public.task_sections (id, project_id, name, position) values
  ('5e000000-0000-4000-8000-000000000001', tests.project_a(), 'Blocked A', 'c'),
  ('5e000000-0000-4000-8000-000000000002', tests.project_a(), 'Parked A', 'e'),
  ('5e000000-0000-4000-8000-000000000003', tests.project_b(), 'Blocked B', 'c');
insert into public.tasks (project_id, section_id, title, position) values
  (tests.project_a(), '5e000000-0000-4000-8000-000000000002', 'Parked task', 'G');

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select name from public.task_sections order by position',
  array['Open', 'In progress', 'Blocked A', 'Parked A', 'Review', 'Done'],
  'editor sees the columns of project A in board order');
select tests.authenticate_as('commenter@tests.local');
select is(
  (select count(*) from public.task_sections), 6::bigint,
  'commenter sees the columns of project A');
select tests.authenticate_as('viewer@tests.local');
select is(
  (select count(*) from public.task_sections), 6::bigint,
  'viewer sees the columns of project A');
select tests.authenticate_as('outsider@tests.local');
select results_eq(
  'select name from public.task_sections order by position',
  array['Open', 'In progress', 'Blocked B', 'Review', 'Done'],
  'outsider sees project B only');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.task_sections), 11::bigint, 'admin sees every column');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.task_sections', 'deactivated member sees no columns');
select tests.authenticate_as('stranger@tests.local');
select is_empty(
  'select id from public.task_sections', 'user without a profile sees no columns');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.task_sections (project_id, name, position)
     values (tests.project_a(), 'New A', 'x') $$,
  'editor adds a column to project A');
select results_eq(
  $$ select color, is_done, created_by from public.task_sections where name = 'New A' $$,
  $$ values ('#64748b', false, tests.uid('editor')) $$,
  'a new column is open, grey and created by the caller');
select throws_ok(
  $$ insert into public.task_sections (project_id, name, position)
     values (tests.project_b(), 'X', 'x') $$,
  '42501', null, 'editor of project A cannot add a column to project B');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into public.task_sections (project_id, name, position)
     values (tests.project_a(), 'X', 'x') $$,
  '42501', null, 'commenter cannot add a column');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.task_sections (project_id, name, position)
     values (tests.project_a(), 'X', 'x') $$,
  '42501', null, 'viewer cannot add a column');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.task_sections (project_id, name, position)
     values (tests.project_a(), 'X', 'x') $$,
  '42501', null, 'outsider cannot add a column to project A');
select lives_ok(
  $$ insert into public.task_sections (project_id, name, position)
     values (tests.project_b(), 'New B', 'x') $$,
  'outsider adds a column to project B');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.task_sections (project_id, name, position)
     values (tests.project_b(), 'Admin B', 'y') $$,
  'admin adds a column without being a project member');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.task_sections (project_id, name, position)
     values (tests.project_a(), 'X', 'x') $$,
  '42501', null, 'deactivated editor cannot add a column');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.task_sections set name = 'Blocked A renamed', color = '#DC2626'
     where id = '5e000000-0000-4000-8000-000000000001' returning id $$,
  'editor renames and recolours a column of project A');
select throws_ok(
  $$ update public.task_sections set project_id = tests.project_b()
     where id = '5e000000-0000-4000-8000-000000000001' $$,
  '23514', 'a row cannot move to another project', 'editor cannot move a column into project B');
select is_empty(
  $$ update public.task_sections set name = 'hacked'
     where id = '5e000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot update a column of project B');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.task_sections set name = 'hacked' returning id $$,
  'commenter cannot update columns');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.task_sections set is_done = true returning id $$,
  'viewer cannot update columns');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.task_sections set name = 'hacked'
     where project_id = tests.project_a() returning id $$,
  'outsider cannot update columns of project A');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.task_sections set name = 'Blocked B renamed'
     where id = '5e000000-0000-4000-8000-000000000003' returning id $$,
  'admin renames a column of project B');

select tests.reset_role();
select results_eq(
  $$ select name from public.task_sections where id::text like '5e000000-%' order by id $$,
  array['Blocked A renamed', 'Parked A', 'Blocked B renamed'],
  'only the allowed updates were stored');
select is(
  (select count(*) from public.task_sections where is_done), 2::bigint,
  'only the two seeded Done columns are done columns');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  'delete from public.task_sections returning id', 'viewer cannot delete columns');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  'delete from public.task_sections returning id', 'commenter cannot delete columns');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.task_sections where project_id = tests.project_a() returning id $$,
  'outsider cannot delete columns of project A');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ delete from public.task_sections
     where id = '5e000000-0000-4000-8000-000000000001' returning id $$,
  'editor deletes an empty column of project A');
select throws_ok(
  $$ delete from public.task_sections where id = '5e000000-0000-4000-8000-000000000002' $$,
  '23503', null, 'a column that still holds tasks cannot be deleted');
select is_empty(
  $$ delete from public.task_sections
     where id = '5e000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot delete a column of project B');

select tests.reset_role();
select results_eq(
  $$ select id from public.task_sections where id::text like '5e000000-%' order by id $$,
  array['5e000000-0000-4000-8000-000000000002'::uuid,
        '5e000000-0000-4000-8000-000000000003'::uuid],
  'only the allowed delete took effect');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.task_sections', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.task_sections (project_id, name, position)
     values (tests.project_a(), 'anon', 'G') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.task_sections set name = 'anon' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.task_sections', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
