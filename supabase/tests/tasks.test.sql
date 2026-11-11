-- RLS on public.tasks: every project role reads, only editors (and workspace
-- admins) write. An assignee below editor changes nothing directly; the
-- set_task_completed function covers that case (see functions_phase2).

begin;

select plan(37);

select tests.setup_workspace();
insert into public.tasks (id, project_id, section_id, assignee_id, title, position) values
  ('7a000000-0000-4000-8000-000000000001', tests.project_a(),
   tests.section_id(tests.project_a(), 'Open'), tests.uid('commenter'), 'Scout A', 'G'),
  ('7a000000-0000-4000-8000-000000000002', tests.project_a(),
   tests.section_id(tests.project_a(), 'Open'), tests.uid('viewer'), 'Cast A', 'V'),
  ('7a000000-0000-4000-8000-000000000003', tests.project_b(),
   tests.section_id(tests.project_b(), 'Open'), tests.uid('outsider'), 'Scout B', 'G');
insert into public.tasks (id, project_id, section_id, parent_task_id, title, position) values
  ('7a000000-0000-4000-8000-000000000004', tests.project_a(),
   tests.section_id(tests.project_a(), 'Open'), '7a000000-0000-4000-8000-000000000002',
   'Call agency A', 'G');

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select title from public.tasks order by title',
  array['Call agency A', 'Cast A', 'Scout A'], 'editor sees the tasks of project A');
select tests.authenticate_as('commenter@tests.local');
select results_eq(
  'select title from public.tasks order by title',
  array['Call agency A', 'Cast A', 'Scout A'],
  'commenter sees every task of project A, not only their own');
select tests.authenticate_as('viewer@tests.local');
select results_eq(
  'select title from public.tasks order by title',
  array['Call agency A', 'Cast A', 'Scout A'], 'viewer sees the tasks of project A');
select tests.authenticate_as('outsider@tests.local');
select results_eq(
  'select title from public.tasks order by title',
  array['Scout B'], 'outsider sees project B only');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.tasks), 4::bigint, 'admin sees every task');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.tasks', 'deactivated member sees no tasks');
select tests.authenticate_as('stranger@tests.local');
select is_empty('select id from public.tasks', 'user without a profile sees no tasks');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.tasks (project_id, section_id, assignee_id, title, position, due_at)
     values (tests.project_a(), tests.section_id(tests.project_a(), 'Open'),
             tests.uid('editor'), 'New A', 'k', now() + interval '1 day') $$,
  'editor adds a task to project A');
select results_eq(
  $$ select priority, labels, completed_at, created_by from public.tasks
     where title = 'New A' $$,
  $$ values ('normal', '{}'::text[], null::timestamptz, tests.uid('editor')) $$,
  'a new task is open, normal priority and created by the caller');
select lives_ok(
  $$ insert into public.tasks (project_id, section_id, parent_task_id, title, position)
     values (tests.project_a(), tests.section_id(tests.project_a(), 'Open'),
             '7a000000-0000-4000-8000-000000000001', 'Subtask A', 'G') $$,
  'editor adds a subtask');
select throws_ok(
  $$ insert into public.tasks (project_id, section_id, title, position)
     values (tests.project_b(), tests.section_id(tests.project_b(), 'Open'), 'X', 'k') $$,
  '42501', null, 'editor of project A cannot add a task to project B');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into public.tasks (project_id, section_id, assignee_id, title, position)
     values (tests.project_a(), tests.section_id(tests.project_a(), 'Open'),
             tests.uid('commenter'), 'X', 'k') $$,
  '42501', null, 'commenter cannot add a task, not even one assigned to themselves');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.tasks (project_id, section_id, title, position)
     values (tests.project_a(), tests.section_id(tests.project_a(), 'Open'), 'X', 'k') $$,
  '42501', null, 'viewer cannot add a task');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.tasks (project_id, section_id, title, position)
     values (tests.project_a(), tests.section_id(tests.project_a(), 'Open'), 'X', 'k') $$,
  '42501', null, 'outsider cannot add a task to project A');
select lives_ok(
  $$ insert into public.tasks (project_id, section_id, title, position)
     values (tests.project_b(), tests.section_id(tests.project_b(), 'Open'), 'New B', 'k') $$,
  'outsider adds a task to project B');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.tasks (project_id, section_id, title, position)
     values (tests.project_b(), tests.section_id(tests.project_b(), 'Review'),
             'Admin B', 'G') $$,
  'admin adds a task without being a project member');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.tasks (project_id, section_id, title, position)
     values (tests.project_a(), tests.section_id(tests.project_a(), 'Open'), 'X', 'k') $$,
  '42501', null, 'deactivated editor cannot add a task');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.tasks
     set title = 'Scout A renamed', priority = 'high', labels = array['location'],
         assignee_id = tests.uid('editor')
     where id = '7a000000-0000-4000-8000-000000000001' returning id $$,
  'editor updates and reassigns a task of project A');
select isnt_empty(
  $$ update public.tasks set section_id = tests.section_id(tests.project_a(), 'Review')
     where id = '7a000000-0000-4000-8000-000000000004' returning id $$,
  'editor moves a task to another column');
select throws_ok(
  $$ update public.tasks
     set project_id = tests.project_b(),
         section_id = tests.section_id(tests.project_b(), 'Open'), parent_task_id = null
     where id = '7a000000-0000-4000-8000-000000000004' $$,
  '23514', 'a row cannot move to another project', 'editor cannot move a task into project B');
select is_empty(
  $$ update public.tasks set title = 'hacked'
     where id = '7a000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot update a task of project B');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.tasks set title = 'hacked' returning id $$,
  'commenter cannot update tasks');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.tasks set title = 'hacked'
     where id = '7a000000-0000-4000-8000-000000000002' returning id $$,
  'viewer cannot update a task, not even one assigned to them');
select is_empty(
  $$ update public.tasks set section_id = tests.section_id(tests.project_a(), 'Done')
     where assignee_id = tests.uid('viewer') returning id $$,
  'viewer cannot move their own task to the done column');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.tasks set title = 'hacked'
     where project_id = tests.project_a() returning id $$,
  'outsider cannot update tasks of project A');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.tasks set title = 'Scout B renamed'
     where id = '7a000000-0000-4000-8000-000000000003' returning id $$,
  'admin updates a task of project B');

select tests.reset_role();
select results_eq(
  $$ select title, completed_at is not null from public.tasks
     where id::text like '7a000000-%' order by id $$,
  $$ values ('Scout A renamed', false), ('Cast A', false), ('Scout B renamed', false),
            ('Call agency A', false) $$,
  'only the allowed updates were stored');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty('delete from public.tasks returning id', 'viewer cannot delete tasks');
select tests.authenticate_as('commenter@tests.local');
select is_empty('delete from public.tasks returning id', 'commenter cannot delete tasks');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.tasks where project_id = tests.project_a() returning id $$,
  'outsider cannot delete tasks of project A');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ delete from public.tasks
     where id = '7a000000-0000-4000-8000-000000000002' returning id $$,
  'editor deletes a task of project A');
select is_empty(
  $$ delete from public.tasks
     where id = '7a000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot delete a task of project B');

select tests.reset_role();
select results_eq(
  $$ select id from public.tasks where id::text like '7a000000-%' order by id $$,
  array['7a000000-0000-4000-8000-000000000001'::uuid,
        '7a000000-0000-4000-8000-000000000003'::uuid],
  'only the allowed delete took effect, and it took the subtask along');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.tasks', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.tasks (project_id, section_id, title, position)
     values (tests.project_a(), tests.section_id(tests.project_a(), 'Open'), 'anon', 'G') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.tasks set title = 'anon' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.tasks', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
