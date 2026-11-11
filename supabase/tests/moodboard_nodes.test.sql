-- RLS on public.moodboard_nodes: every project role reads, only editors (and
-- workspace admins) write. project_id comes from the board.

begin;

select plan(35);

select tests.setup_workspace();
insert into public.moodboards (id, project_id, title) values
  ('bd000000-0000-4000-8000-000000000001', tests.project_a(), 'Look A'),
  ('bd000000-0000-4000-8000-000000000002', tests.project_b(), 'Look B');
insert into public.moodboard_nodes (id, board_id, type, x, y, width, height, data) values
  ('d0000000-0000-4000-8000-000000000001', 'bd000000-0000-4000-8000-000000000001',
   'note', 0, 0, 200, 120, '{"text": "Fog A"}'),
  ('d0000000-0000-4000-8000-000000000002', 'bd000000-0000-4000-8000-000000000001',
   'color', 240, 0, 80, 80, '{"hex": "#0f172a"}'),
  ('d0000000-0000-4000-8000-000000000003', 'bd000000-0000-4000-8000-000000000002',
   'note', 0, 0, 200, 120, '{"text": "Fog B"}');

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select type from public.moodboard_nodes order by x',
  array['note', 'color'], 'editor sees the nodes of project A');
select tests.authenticate_as('commenter@tests.local');
select results_eq(
  'select type from public.moodboard_nodes order by x',
  array['note', 'color'], 'commenter sees the nodes of project A');
select tests.authenticate_as('viewer@tests.local');
select results_eq(
  'select type from public.moodboard_nodes order by x',
  array['note', 'color'], 'viewer sees the nodes of project A');
select tests.authenticate_as('outsider@tests.local');
select results_eq(
  'select id from public.moodboard_nodes',
  array['d0000000-0000-4000-8000-000000000003'::uuid], 'outsider sees project B only');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.moodboard_nodes), 3::bigint, 'admin sees every node');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.moodboard_nodes', 'deactivated member sees no nodes');
select tests.authenticate_as('stranger@tests.local');
select is_empty(
  'select id from public.moodboard_nodes', 'user without a profile sees no nodes');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.moodboard_nodes (id, board_id, type, x, y, width, height)
     values ('d0000000-0000-4000-8000-00000000000a', 'bd000000-0000-4000-8000-000000000001',
             'text', 10, 300, 100, 40) $$,
  'editor adds a node with a client-chosen id to a board of project A');
select results_eq(
  $$ select project_id, z, data, created_by from public.moodboard_nodes
     where id = 'd0000000-0000-4000-8000-00000000000a' $$,
  $$ values (tests.project_a(), 0, '{}'::jsonb, tests.uid('editor')) $$,
  'the node takes its project from the board and its creator from the caller');
select throws_ok(
  $$ insert into public.moodboard_nodes (board_id, type, x, y, width, height)
     values ('bd000000-0000-4000-8000-000000000002', 'note', 0, 0, 10, 10) $$,
  '42501', null, 'editor of project A cannot add a node to a board of project B');
select throws_ok(
  $$ insert into public.moodboard_nodes (board_id, type, x, y, width, height)
     values ('bd000000-0000-4000-8000-000000000001', 'note', 0, 0, 0, 10) $$,
  '23514', null, 'a node needs a positive size');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into public.moodboard_nodes (board_id, type, x, y, width, height)
     values ('bd000000-0000-4000-8000-000000000001', 'note', 0, 0, 10, 10) $$,
  '42501', null, 'commenter cannot add a node');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.moodboard_nodes (board_id, type, x, y, width, height)
     values ('bd000000-0000-4000-8000-000000000001', 'note', 0, 0, 10, 10) $$,
  '42501', null, 'viewer cannot add a node');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.moodboard_nodes (board_id, type, x, y, width, height)
     values ('bd000000-0000-4000-8000-000000000001', 'note', 0, 0, 10, 10) $$,
  '42501', null, 'outsider cannot add a node to a board of project A');
select lives_ok(
  $$ insert into public.moodboard_nodes (board_id, type, x, y, width, height)
     values ('bd000000-0000-4000-8000-000000000002', 'link', 300, 0, 10, 10) $$,
  'outsider adds a node to a board of project B');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.moodboard_nodes (board_id, type, x, y, width, height)
     values ('bd000000-0000-4000-8000-000000000002', 'group', 600, 0, 10, 10) $$,
  'admin adds a node without being a project member');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.moodboard_nodes (board_id, type, x, y, width, height)
     values ('bd000000-0000-4000-8000-000000000001', 'note', 0, 0, 10, 10) $$,
  '42501', null, 'deactivated editor cannot add a node');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.moodboard_nodes set x = 50, y = 60, z = 3
     where id = 'd0000000-0000-4000-8000-000000000001' returning id $$,
  'editor moves a node of project A');
select throws_ok(
  $$ update public.moodboard_nodes set board_id = 'bd000000-0000-4000-8000-000000000002'
     where id = 'd0000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'editor cannot move a node to a board of project B');
select is_empty(
  $$ update public.moodboard_nodes set x = 999
     where id = 'd0000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot update a node of project B');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.moodboard_nodes set x = 999 returning id $$,
  'commenter cannot update nodes');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.moodboard_nodes set x = 999 returning id $$,
  'viewer cannot update nodes');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.moodboard_nodes set x = 999
     where project_id = tests.project_a() returning id $$,
  'outsider cannot update nodes of project A');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.moodboard_nodes set x = 70
     where id = 'd0000000-0000-4000-8000-000000000003' returning id $$,
  'admin moves a node of project B');

select tests.reset_role();
select results_eq(
  $$ select x, project_id from public.moodboard_nodes
     where id::text like 'd0000000-0000-4000-8000-00000000000_' and id::text !~ 'a$'
     order by id $$,
  $$ values (50::double precision, tests.project_a()),
            (240::double precision, tests.project_a()),
            (70::double precision, tests.project_b()) $$,
  'only the allowed updates were stored');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  'delete from public.moodboard_nodes returning id', 'viewer cannot delete nodes');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  'delete from public.moodboard_nodes returning id', 'commenter cannot delete nodes');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.moodboard_nodes where project_id = tests.project_a() returning id $$,
  'outsider cannot delete nodes of project A');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ delete from public.moodboard_nodes
     where id = 'd0000000-0000-4000-8000-000000000001' returning id $$,
  'editor deletes a node of project A');
select is_empty(
  $$ delete from public.moodboard_nodes
     where id = 'd0000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot delete a node of project B');

select tests.reset_role();
select results_eq(
  $$ select id from public.moodboard_nodes
     where id in ('d0000000-0000-4000-8000-000000000001',
                  'd0000000-0000-4000-8000-000000000002',
                  'd0000000-0000-4000-8000-000000000003') order by id $$,
  array['d0000000-0000-4000-8000-000000000002'::uuid,
        'd0000000-0000-4000-8000-000000000003'::uuid],
  'only the allowed delete took effect');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.moodboard_nodes', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.moodboard_nodes (board_id, type, x, y, width, height)
     values ('bd000000-0000-4000-8000-000000000001', 'note', 0, 0, 10, 10) $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.moodboard_nodes set x = 1 $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.moodboard_nodes', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
