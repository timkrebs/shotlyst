-- RLS on public.moodboard_edges: every project role reads, only editors (and
-- workspace admins) write. Every insert here names the project of its board;
-- functions_phase2 covers what the triggers do with other values.

begin;

select plan(35);

select tests.setup_workspace();
insert into public.moodboards (id, project_id, title) values
  ('bd000000-0000-4000-8000-000000000001', tests.project_a(), 'Look A'),
  ('bd000000-0000-4000-8000-000000000002', tests.project_b(), 'Look B');
insert into public.moodboard_nodes (id, board_id, type, x, y, width, height) values
  ('d0000000-0000-4000-8000-000000000001', 'bd000000-0000-4000-8000-000000000001',
   'note', 0, 0, 10, 10),
  ('d0000000-0000-4000-8000-000000000002', 'bd000000-0000-4000-8000-000000000001',
   'note', 20, 0, 10, 10),
  ('d0000000-0000-4000-8000-000000000003', 'bd000000-0000-4000-8000-000000000001',
   'note', 40, 0, 10, 10),
  ('d0000000-0000-4000-8000-000000000004', 'bd000000-0000-4000-8000-000000000002',
   'note', 0, 0, 10, 10),
  ('d0000000-0000-4000-8000-000000000005', 'bd000000-0000-4000-8000-000000000002',
   'note', 20, 0, 10, 10);
insert into public.moodboard_edges (id, project_id, board_id, source_node_id, target_node_id)
values
  ('ed000000-0000-4000-8000-000000000001', tests.project_a(),
   'bd000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000002'),
  ('ed000000-0000-4000-8000-000000000002', tests.project_a(),
   'bd000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
   'd0000000-0000-4000-8000-000000000003'),
  ('ed000000-0000-4000-8000-000000000003', tests.project_b(),
   'bd000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000004',
   'd0000000-0000-4000-8000-000000000005');

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select id from public.moodboard_edges order by id',
  array['ed000000-0000-4000-8000-000000000001'::uuid,
        'ed000000-0000-4000-8000-000000000002'::uuid],
  'editor sees the edges of project A');
select tests.authenticate_as('commenter@tests.local');
select is(
  (select count(*) from public.moodboard_edges where project_id = tests.project_a()),
  2::bigint, 'commenter sees the edges of project A');
select tests.authenticate_as('viewer@tests.local');
select results_eq(
  'select id from public.moodboard_edges order by id',
  array['ed000000-0000-4000-8000-000000000001'::uuid,
        'ed000000-0000-4000-8000-000000000002'::uuid],
  'viewer sees the edges of project A');
select tests.authenticate_as('outsider@tests.local');
select results_eq(
  'select id from public.moodboard_edges',
  array['ed000000-0000-4000-8000-000000000003'::uuid], 'outsider sees project B only');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.moodboard_edges), 3::bigint, 'admin sees every edge');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.moodboard_edges', 'deactivated member sees no edges');
select tests.authenticate_as('stranger@tests.local');
select is_empty(
  'select id from public.moodboard_edges', 'user without a profile sees no edges');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.moodboard_edges
       (id, project_id, board_id, source_node_id, target_node_id, style)
     values ('ed000000-0000-4000-8000-00000000000a', tests.project_a(),
             'bd000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000003', '{"dashed": true}') $$,
  'editor connects two nodes on a board of project A');
select is(
  (select created_by from public.moodboard_edges
   where id = 'ed000000-0000-4000-8000-00000000000a'),
  tests.uid('editor'), 'created_by defaults to the caller');
select throws_ok(
  $$ insert into public.moodboard_edges (project_id, board_id, source_node_id, target_node_id)
     values (tests.project_b(), 'bd000000-0000-4000-8000-000000000002',
             'd0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000004') $$,
  '42501', null, 'editor of project A cannot add an edge to a board of project B');
select throws_ok(
  $$ insert into public.moodboard_edges (project_id, board_id, source_node_id, target_node_id)
     values (tests.project_a(), 'bd000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001') $$,
  '23514', null, 'an edge cannot connect a node to itself');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into public.moodboard_edges (project_id, board_id, source_node_id, target_node_id)
     values (tests.project_a(), 'bd000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'commenter cannot add an edge');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.moodboard_edges (project_id, board_id, source_node_id, target_node_id)
     values (tests.project_a(), 'bd000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'viewer cannot add an edge');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.moodboard_edges (project_id, board_id, source_node_id, target_node_id)
     values (tests.project_a(), 'bd000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'outsider cannot add an edge to a board of project A');
select lives_ok(
  $$ insert into public.moodboard_edges (project_id, board_id, source_node_id, target_node_id)
     values (tests.project_b(), 'bd000000-0000-4000-8000-000000000002',
             'd0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000004') $$,
  'outsider adds an edge to a board of project B');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.moodboard_edges (project_id, board_id, source_node_id, target_node_id)
     values (tests.project_b(), 'bd000000-0000-4000-8000-000000000002',
             'd0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000005') $$,
  'admin adds an edge without being a project member');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.moodboard_edges (project_id, board_id, source_node_id, target_node_id)
     values (tests.project_a(), 'bd000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'deactivated editor cannot add an edge');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.moodboard_edges set style = '{"color": "#dc2626"}'
     where id = 'ed000000-0000-4000-8000-000000000001' returning id $$,
  'editor restyles an edge of project A');
select is_empty(
  $$ update public.moodboard_edges set style = '{"hacked": true}'
     where id = 'ed000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot update an edge of project B');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.moodboard_edges set style = '{"hacked": true}' returning id $$,
  'commenter cannot update edges');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.moodboard_edges set style = '{"hacked": true}' returning id $$,
  'viewer cannot update edges');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.moodboard_edges set style = '{"hacked": true}'
     where project_id = tests.project_a() returning id $$,
  'outsider cannot update edges of project A');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.moodboard_edges set style = '{"color": "#16a34a"}'
     where id = 'ed000000-0000-4000-8000-000000000003' returning id $$,
  'admin restyles an edge of project B');

select tests.reset_role();
select results_eq(
  $$ select style from public.moodboard_edges
     where id::text like 'ed000000-0000-4000-8000-00000000000_' and id::text !~ 'a$'
     order by id $$,
  $$ values ('{"color": "#dc2626"}'::jsonb), ('{}'::jsonb), ('{"color": "#16a34a"}'::jsonb) $$,
  'only the allowed updates were stored');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  'delete from public.moodboard_edges returning id', 'viewer cannot delete edges');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  'delete from public.moodboard_edges returning id', 'commenter cannot delete edges');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.moodboard_edges where project_id = tests.project_a() returning id $$,
  'outsider cannot delete edges of project A');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ delete from public.moodboard_edges
     where id = 'ed000000-0000-4000-8000-00000000000a' returning id $$,
  'editor deletes an edge of project A');
select is_empty(
  $$ delete from public.moodboard_edges
     where id = 'ed000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot delete an edge of project B');
select isnt_empty(
  $$ delete from public.moodboard_nodes
     where id = 'd0000000-0000-4000-8000-000000000001' returning id $$,
  'editor deletes a node that still has an edge');

select tests.reset_role();
select results_eq(
  $$ select id from public.moodboard_edges where id::text like 'ed000000-%' order by id $$,
  array['ed000000-0000-4000-8000-000000000002'::uuid,
        'ed000000-0000-4000-8000-000000000003'::uuid],
  'only the allowed deletes took effect; an edge goes with either of its nodes');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.moodboard_edges', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.moodboard_edges (project_id, board_id, source_node_id, target_node_id)
     values (tests.project_a(), 'bd000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.moodboard_edges set style = '{}' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.moodboard_edges', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
