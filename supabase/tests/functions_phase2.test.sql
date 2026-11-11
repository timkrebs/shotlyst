-- Phase 2 triggers and RPC functions: project_id from the parent row,
-- same-project references, task completion, the active concept, the defaults
-- of a new project and the cascade when a project is deleted.

begin;

select plan(99);

select tests.setup_workspace();

insert into public.concept_folders (id, project_id, name, position) values
  ('cf000000-0000-4000-8000-000000000001', tests.project_a(), 'Drafts A', 'G'),
  ('cf000000-0000-4000-8000-000000000002', tests.project_b(), 'Drafts B', 'G');
insert into public.concepts (id, project_id, folder_id, title) values
  ('cc000000-0000-4000-8000-000000000001', tests.project_a(),
   'cf000000-0000-4000-8000-000000000001', 'Brief A'),
  ('cc000000-0000-4000-8000-000000000002', tests.project_b(), null, 'Brief B');
insert into public.concept_beats (id, concept_id, title, start_sec, end_sec, position) values
  ('cb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001',
   'Hook A', 0, 5, 'G'),
  ('cb000000-0000-4000-8000-000000000002', 'cc000000-0000-4000-8000-000000000002',
   'Hook B', 0, 5, 'G');
insert into public.beat_items (id, beat_id, label, position) values
  ('b1000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001',
   'Find the pier', 'G');
insert into public.moodboards (id, project_id, title) values
  ('bd000000-0000-4000-8000-000000000001', tests.project_a(), 'Look A'),
  ('bd000000-0000-4000-8000-000000000002', tests.project_b(), 'Look B');
insert into public.files (id, project_id, path, name, mime, size, created_by) values
  ('f0000000-0000-4000-8000-000000000001', tests.project_a(),
   tests.project_a() || '/files/a.png', 'a.png', 'image/png', 1, tests.uid('editor')),
  ('f0000000-0000-4000-8000-000000000002', tests.project_b(),
   tests.project_b() || '/files/b.png', 'b.png', 'image/png', 1, tests.uid('outsider')),
  ('f0000000-0000-4000-8000-000000000003', null,
   'library/avatars/owner.png', 'owner.png', 'image/png', 1, tests.uid('owner'));
insert into public.moodboard_nodes (id, board_id, type, x, y, width, height) values
  ('d0000000-0000-4000-8000-000000000001', 'bd000000-0000-4000-8000-000000000001',
   'note', 0, 0, 10, 10),
  ('d0000000-0000-4000-8000-000000000002', 'bd000000-0000-4000-8000-000000000001',
   'note', 20, 0, 10, 10),
  ('d0000000-0000-4000-8000-000000000003', 'bd000000-0000-4000-8000-000000000002',
   'note', 0, 0, 10, 10),
  ('d0000000-0000-4000-8000-000000000004', 'bd000000-0000-4000-8000-000000000002',
   'note', 20, 0, 10, 10);
insert into public.tasks (id, project_id, section_id, assignee_id, title, position) values
  ('7a000000-0000-4000-8000-000000000001', tests.project_a(),
   tests.section_id(tests.project_a(), 'In progress'), tests.uid('commenter'),
   'Commenter task', 'G'),
  ('7a000000-0000-4000-8000-000000000002', tests.project_a(),
   tests.section_id(tests.project_a(), 'Open'), tests.uid('editor'), 'Editor task', 'G'),
  ('7a000000-0000-4000-8000-000000000003', tests.project_a(),
   tests.section_id(tests.project_a(), 'Open'), tests.uid('viewer'), 'Viewer task', 'V'),
  ('7a000000-0000-4000-8000-000000000004', tests.project_b(),
   tests.section_id(tests.project_b(), 'Open'), tests.uid('outsider'), 'Outsider task', 'G');

select is(
  (select count(*) from public.concept_beats b
     join public.concepts c on c.id = b.concept_id and c.project_id = b.project_id)
  + (select count(*) from public.beat_items i
       join public.concept_beats b on b.id = i.beat_id and b.project_id = i.project_id)
  + (select count(*) from public.moodboard_nodes n
       join public.moodboards m on m.id = n.board_id and m.project_id = n.project_id),
  7::bigint, 'child rows inserted without a project_id take it from their parent');

-- project_id comes from the parent ------------------------------------------
-- The owner may edit both projects, so RLS is not what decides here.

select tests.authenticate_as('owner@tests.local');
select results_eq(
  $$ insert into public.concept_beats
       (project_id, concept_id, title, start_sec, end_sec, position)
     values (tests.project_b(), 'cc000000-0000-4000-8000-000000000001', 'Forged', 5, 9, 'V')
     returning project_id $$,
  array[tests.project_a()], 'a beat ignores the project_id the caller sends');
select results_eq(
  $$ insert into public.beat_items (project_id, beat_id, label, position)
     values (tests.project_b(), 'cb000000-0000-4000-8000-000000000001', 'Forged', 'V')
     returning project_id $$,
  array[tests.project_a()], 'a beat item ignores the project_id the caller sends');
select results_eq(
  $$ insert into public.moodboard_nodes (project_id, board_id, type, x, y, width, height)
     values (tests.project_b(), 'bd000000-0000-4000-8000-000000000001', 'note', 0, 0, 1, 1)
     returning project_id $$,
  array[tests.project_a()], 'a board node ignores the project_id the caller sends');
select lives_ok(
  $$ insert into public.moodboard_edges
       (id, project_id, board_id, source_node_id, target_node_id)
     values ('ed000000-0000-4000-8000-00000000000a', tests.project_b(),
             'bd000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000002') $$,
  'a board edge ignores the project_id the caller sends');
select lives_ok(
  $$ insert into public.moodboard_edges (id, board_id, source_node_id, target_node_id)
     values ('ed000000-0000-4000-8000-00000000000b', 'bd000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001') $$,
  'a board edge needs no project_id from the caller');
select lives_ok(
  $$ insert into public.moodboard_nodes (board_id, type, x, y, width, height, file_id)
     values ('bd000000-0000-4000-8000-000000000001', 'image', 0, 0, 1, 1,
             'f0000000-0000-4000-8000-000000000001') $$,
  'a board node with a file needs no project_id from the caller');
select results_eq(
  $$ insert into public.moodboard_edges
       (id, project_id, board_id, source_node_id, target_node_id)
     values ('ed000000-0000-4000-8000-000000000001', tests.project_a(),
             'bd000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000002')
     returning project_id $$,
  array[tests.project_a()], 'a board edge that names the project of its board is stored');

select results_eq(
  $$ update public.concept_beats set project_id = tests.project_b()
     where id = 'cb000000-0000-4000-8000-000000000001' returning project_id $$,
  array[tests.project_a()], 'an update cannot change the project_id of a beat');
select results_eq(
  $$ update public.beat_items set project_id = tests.project_b()
     where id = 'b1000000-0000-4000-8000-000000000001' returning project_id $$,
  array[tests.project_a()], 'an update cannot change the project_id of a beat item');
select results_eq(
  $$ update public.moodboard_nodes set project_id = tests.project_b()
     where id = 'd0000000-0000-4000-8000-000000000001' returning project_id $$,
  array[tests.project_a()], 'an update cannot change the project_id of a board node');
select throws_ok(
  $$ update public.concept_beats set concept_id = 'cc000000-0000-4000-8000-000000000002'
     where title = 'Forged' $$,
  '23514', 'a row cannot move to another project',
  'a beat cannot move to a concept of another project');
select throws_ok(
  $$ insert into public.concept_beats (concept_id, title, start_sec, end_sec, position)
     values (gen_random_uuid(), 'Orphan', 0, 5, 'G') $$,
  '23503', 'parent row not found', 'a beat needs an existing concept');
select throws_ok(
  $$ insert into public.moodboard_nodes (board_id, type, x, y, width, height)
     values (gen_random_uuid(), 'note', 0, 0, 1, 1) $$,
  '23503', 'parent row not found', 'a board node needs an existing board');

-- An editor of project A names project A but points at a parent in B.
select tests.authenticate_as('editor@tests.local');
select throws_ok(
  $$ insert into public.concept_beats
       (project_id, concept_id, title, start_sec, end_sec, position)
     values (tests.project_a(), 'cc000000-0000-4000-8000-000000000002', 'X', 10, 20, 'k') $$,
  '42501', null, 'editor of A cannot attach a beat to a concept of B');
select throws_ok(
  $$ insert into public.beat_items (project_id, beat_id, label, position)
     values (tests.project_a(), 'cb000000-0000-4000-8000-000000000002', 'X', 'k') $$,
  '42501', null, 'editor of A cannot attach a beat item to a beat of B');
select throws_ok(
  $$ insert into public.moodboard_nodes (project_id, board_id, type, x, y, width, height)
     values (tests.project_a(), 'bd000000-0000-4000-8000-000000000002', 'note', 0, 0, 1, 1) $$,
  '42501', null, 'editor of A cannot attach a node to a board of B');
select throws_ok(
  $$ insert into public.moodboard_edges (project_id, board_id, source_node_id, target_node_id)
     values (tests.project_b(), 'bd000000-0000-4000-8000-000000000002',
             'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000004') $$,
  '42501', null, 'editor of A cannot attach an edge to a board of B');
select throws_ok(
  $$ insert into public.moodboard_edges (project_id, board_id, source_node_id, target_node_id)
     values (tests.project_a(), 'bd000000-0000-4000-8000-000000000002',
             'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000004') $$,
  '42501', null, 'editor of A cannot attach an edge to a board of B while naming A');
select throws_ok(
  $$ update public.beat_items set beat_id = 'cb000000-0000-4000-8000-000000000002'
     where id = 'b1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'editor of A cannot move a beat item to a beat of B');
select throws_ok(
  $$ update public.moodboard_nodes set board_id = 'bd000000-0000-4000-8000-000000000002'
     where id = 'd0000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'editor of A cannot move a node to a board of B');

select tests.reset_role();
select is_empty(
  $$ select 1 from public.concept_beats where title = 'X'
     union all select 1 from public.beat_items where label = 'X'
     union all select 1 from public.moodboard_edges
       where board_id = 'bd000000-0000-4000-8000-000000000002' $$,
  'nothing was attached across projects');

-- References stay inside the project ----------------------------------------

select tests.authenticate_as('owner@tests.local');
select lives_ok(
  $$ insert into public.concepts (project_id, folder_id, title)
     values (tests.project_a(), 'cf000000-0000-4000-8000-000000000001', 'Filed') $$,
  'a concept accepts a folder of its own project');
select throws_ok(
  $$ insert into public.concepts (project_id, folder_id, title)
     values (tests.project_a(), 'cf000000-0000-4000-8000-000000000002', 'Misfiled') $$,
  '23514', 'folder_id belongs to another project',
  'a concept rejects a folder of another project');
select throws_ok(
  $$ update public.concepts set folder_id = 'cf000000-0000-4000-8000-000000000002'
     where id = 'cc000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'a concept cannot be moved into a folder of another project');
select throws_ok(
  $$ update public.concepts set project_id = tests.project_b()
     where id = 'cc000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'a concept cannot change project while it sits in a folder');

select throws_ok(
  $$ insert into public.tasks (project_id, section_id, title, position)
     values (tests.project_a(), tests.section_id(tests.project_b(), 'Open'), 'X', 'k') $$,
  '23514', 'section_id belongs to another project',
  'a task rejects a column of another project');
select throws_ok(
  $$ update public.tasks set section_id = tests.section_id(tests.project_b(), 'Done')
     where id = '7a000000-0000-4000-8000-000000000002' $$,
  '23514', null, 'a task cannot be moved into a column of another project');
select lives_ok(
  $$ insert into public.tasks (project_id, section_id, parent_task_id, title, position)
     values (tests.project_a(), tests.section_id(tests.project_a(), 'Open'),
             '7a000000-0000-4000-8000-000000000002', 'Subtask', 'G') $$,
  'a task accepts a parent task of its own project');
select throws_ok(
  $$ insert into public.tasks (project_id, section_id, parent_task_id, title, position)
     values (tests.project_a(), tests.section_id(tests.project_a(), 'Open'),
             '7a000000-0000-4000-8000-000000000004', 'X', 'k') $$,
  '23514', 'parent_task_id belongs to another project',
  'a task rejects a parent task of another project');
select throws_ok(
  $$ update public.tasks set parent_task_id = '7a000000-0000-4000-8000-000000000004'
     where id = '7a000000-0000-4000-8000-000000000003' $$,
  '23514', null, 'a task cannot be moved under a parent task of another project');

select lives_ok(
  $$ insert into public.moodboard_nodes
       (id, project_id, board_id, type, x, y, width, height, file_id)
     values ('d0000000-0000-4000-8000-00000000000a', tests.project_a(),
             'bd000000-0000-4000-8000-000000000001', 'image', 0, 0, 1, 1,
             'f0000000-0000-4000-8000-000000000001') $$,
  'a board node accepts a file of its own project');
select throws_ok(
  $$ insert into public.moodboard_nodes (project_id, board_id, type, x, y, width, height, file_id)
     values (tests.project_a(), 'bd000000-0000-4000-8000-000000000001', 'image', 0, 0, 1, 1,
             'f0000000-0000-4000-8000-000000000002') $$,
  '23514', 'file_id belongs to another project',
  'a board node rejects a file of another project');
select throws_ok(
  $$ insert into public.moodboard_nodes (project_id, board_id, type, x, y, width, height, file_id)
     values (tests.project_a(), 'bd000000-0000-4000-8000-000000000001', 'image', 0, 0, 1, 1,
             'f0000000-0000-4000-8000-000000000003') $$,
  '23514', null, 'a board node rejects a library file');
select throws_ok(
  $$ update public.moodboard_nodes set file_id = 'f0000000-0000-4000-8000-000000000002'
     where id = 'd0000000-0000-4000-8000-000000000002' $$,
  '23514', null, 'a board node cannot switch to a file of another project');
select throws_ok(
  $$ insert into public.moodboard_nodes (project_id, board_id, type, x, y, width, height, file_id)
     values (tests.project_b(), 'bd000000-0000-4000-8000-000000000001', 'image', 0, 0, 1, 1,
             'f0000000-0000-4000-8000-000000000002') $$,
  '23514', null,
  'a board node rejects a file of another project when the caller names that project');
select throws_ok(
  $$ delete from public.files where id = 'f0000000-0000-4000-8000-000000000001' $$,
  '23503', null, 'a file in use on a board cannot be deleted');

select throws_ok(
  $$ insert into public.moodboard_edges (project_id, board_id, source_node_id, target_node_id)
     values (tests.project_a(), 'bd000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000002') $$,
  '23514', 'both ends of a line must be on its board',
  'an edge rejects a source node of another project');
select throws_ok(
  $$ insert into public.moodboard_edges (project_id, board_id, source_node_id, target_node_id)
     values (tests.project_a(), 'bd000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000004') $$,
  '23514', 'both ends of a line must be on its board',
  'an edge rejects a target node of another project');
select throws_ok(
  $$ update public.moodboard_edges set target_node_id = 'd0000000-0000-4000-8000-000000000004'
     where id = 'ed000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'an edge cannot be re-pointed at a node of another project');
select throws_ok(
  $$ insert into public.moodboard_edges (project_id, board_id, source_node_id, target_node_id)
     values (tests.project_b(), 'bd000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000004') $$,
  '23514', null,
  'an edge rejects nodes of another project when the caller names that project');

-- tasks.completed_at follows the column -------------------------------------

select tests.authenticate_as('editor@tests.local');
select results_eq(
  $$ insert into public.tasks (project_id, section_id, title, position, completed_at)
     values (tests.project_a(), tests.section_id(tests.project_a(), 'Open'),
             'Forged done', 'k', now())
     returning completed_at $$,
  array[null::timestamptz], 'a task in an open column cannot be stored as completed');
select results_eq(
  $$ insert into public.tasks (id, project_id, section_id, title, position)
     values ('7a000000-0000-4000-8000-00000000000d', tests.project_a(),
             tests.section_id(tests.project_a(), 'Done'), 'Born done', 'G')
     returning completed_at $$,
  array[now()], 'a task inserted into a done column is completed now');
select results_eq(
  $$ update public.tasks set section_id = tests.section_id(tests.project_a(), 'Done')
     where id = '7a000000-0000-4000-8000-000000000002' returning completed_at $$,
  array[now()], 'moving a task into a done column completes it');
select results_eq(
  $$ update public.tasks set completed_at = null
     where id = '7a000000-0000-4000-8000-000000000002' returning completed_at $$,
  array[now()], 'a task in a done column cannot be stored as open');

-- Backdate the completion (triggers off) so that a bump would show.
select tests.reset_role();
set local session_replication_role = replica;
update public.tasks set completed_at = '2020-01-01 00:00:00+00'
where id = '7a000000-0000-4000-8000-000000000002';
set local session_replication_role = origin;
insert into public.task_sections (id, project_id, name, position, is_done) values
  ('5e000000-0000-4000-8000-000000000001', tests.project_a(), 'Archived', 'x', true);

select tests.authenticate_as('editor@tests.local');
select results_eq(
  $$ update public.tasks set title = 'Editor task renamed', priority = 'urgent'
     where id = '7a000000-0000-4000-8000-000000000002' returning completed_at $$,
  array['2020-01-01 00:00:00+00'::timestamptz],
  'other updates keep the completion time of a done task');
select results_eq(
  $$ update public.tasks set completed_at = now()
     where id = '7a000000-0000-4000-8000-000000000002' returning completed_at $$,
  array['2020-01-01 00:00:00+00'::timestamptz],
  'the completion time of a done task cannot be overwritten');
select results_eq(
  $$ update public.tasks set section_id = '5e000000-0000-4000-8000-000000000001'
     where id = '7a000000-0000-4000-8000-000000000002' returning completed_at $$,
  array['2020-01-01 00:00:00+00'::timestamptz],
  'moving between two done columns keeps the completion time');
select results_eq(
  $$ update public.tasks set section_id = tests.section_id(tests.project_a(), 'Review')
     where id = '7a000000-0000-4000-8000-000000000002' returning completed_at $$,
  array[null::timestamptz], 'moving a task back to an open column clears the completion');

-- Flipping is_done on a column resyncs the tasks in it.
select isnt_empty(
  $$ update public.task_sections set is_done = true
     where id = tests.section_id(tests.project_a(), 'Review') returning id $$,
  'editor marks the Review column as done');
select results_eq(
  $$ select title from public.tasks where completed_at is not null order by title $$,
  array['Born done', 'Editor task renamed'],
  'the task in Review is completed; tasks in open columns are not');
select isnt_empty(
  $$ update public.task_sections set name = 'In review'
     where id = tests.section_id(tests.project_a(), 'Review') returning id $$,
  'editor renames the done column');
select is(
  (select completed_at from public.tasks where id = '7a000000-0000-4000-8000-000000000002'),
  now(), 'renaming a column leaves its tasks completed');
select isnt_empty(
  $$ update public.task_sections set is_done = false
     where id = tests.section_id(tests.project_a(), 'In review') returning id $$,
  'editor marks the column as open again');
select results_eq(
  $$ select title from public.tasks where completed_at is not null $$,
  array['Born done'], 'the task in that column is open again; other done tasks are untouched');

select tests.reset_role();
update public.task_sections set name = 'Review'
where id = tests.section_id(tests.project_a(), 'In review');
delete from public.tasks where id = '7a000000-0000-4000-8000-00000000000d';
delete from public.task_sections where id = '5e000000-0000-4000-8000-000000000001';
update public.tasks set section_id = tests.section_id(tests.project_a(), 'Open')
where id = '7a000000-0000-4000-8000-000000000002';

-- set_task_completed ---------------------------------------------------------

select tests.authenticate_as('commenter@tests.local');
select lives_ok(
  $$ select public.set_task_completed('7a000000-0000-4000-8000-000000000001', true) $$,
  'commenter completes the task assigned to them');
select results_eq(
  $$ select s.name, t.completed_at from public.tasks t
     join public.task_sections s on s.id = t.section_id
     where t.id = '7a000000-0000-4000-8000-000000000001' $$,
  $$ values ('Done', now()) $$, 'the task moved to the done column and is completed');
select lives_ok(
  $$ select public.set_task_completed('7a000000-0000-4000-8000-000000000001', true) $$,
  'completing a completed task is a no-op');
select lives_ok(
  $$ select public.set_task_completed('7a000000-0000-4000-8000-000000000001', false) $$,
  'commenter reopens the task assigned to them');
select results_eq(
  $$ select s.name, t.completed_at from public.tasks t
     join public.task_sections s on s.id = t.section_id
     where t.id = '7a000000-0000-4000-8000-000000000001' $$,
  $$ values ('Open', null::timestamptz) $$,
  'the task moved to the first open column and is open');
select throws_ok(
  $$ select public.set_task_completed('7a000000-0000-4000-8000-000000000002', true) $$,
  '42501', null, 'commenter cannot complete a task assigned to someone else');
select throws_ok(
  $$ select public.set_task_completed('7a000000-0000-4000-8000-000000000004', true) $$,
  '42501', null, 'commenter cannot complete a task of another project');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ select public.set_task_completed('7a000000-0000-4000-8000-000000000003', true) $$,
  '42501', null, 'viewer cannot complete even the task assigned to them');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ select public.set_task_completed('7a000000-0000-4000-8000-000000000001', true) $$,
  '42501', null, 'outsider cannot complete a task of project A');
select lives_ok(
  $$ select public.set_task_completed('7a000000-0000-4000-8000-000000000004', true) $$,
  'outsider completes a task of project B');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ select public.set_task_completed('7a000000-0000-4000-8000-000000000001', true) $$,
  '42501', null, 'deactivated editor cannot complete a task');
select tests.authenticate_as('stranger@tests.local');
select throws_ok(
  $$ select public.set_task_completed('7a000000-0000-4000-8000-000000000001', true) $$,
  '42501', null, 'user without a profile cannot complete a task');
select tests.authenticate_anon();
select throws_ok(
  $$ select public.set_task_completed('7a000000-0000-4000-8000-000000000001', true) $$,
  '42501', null, 'anon cannot call set_task_completed');
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ select public.set_task_completed('7a000000-0000-4000-8000-000000000003', true) $$,
  'editor completes a task assigned to someone else');
select throws_ok(
  $$ select public.set_task_completed(gen_random_uuid(), true) $$,
  '42501', 'task not found', 'an unknown task is reported like a forbidden one');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ select public.set_task_completed('7a000000-0000-4000-8000-000000000003', false) $$,
  'admin reopens a task without being a project member');

select tests.reset_role();
select results_eq(
  $$ select title, completed_at is not null from public.tasks
     where id::text like '7a000000-%' order by id $$,
  $$ values ('Commenter task', false), ('Editor task renamed', false),
            ('Viewer task', false), ('Outsider task', true) $$,
  'only the allowed calls changed a task');

update public.task_sections set is_done = false
where id = tests.section_id(tests.project_a(), 'Done');
select tests.authenticate_as('editor@tests.local');
select throws_ok(
  $$ select public.set_task_completed('7a000000-0000-4000-8000-000000000003', true) $$,
  'P0002', null, 'completing fails cleanly on a board without a done column');
select tests.reset_role();
update public.task_sections set is_done = true
where id = tests.section_id(tests.project_a(), 'Done');

-- set_active_concept ---------------------------------------------------------

select results_eq(
  $$ select title from public.concepts where project_id = tests.project_a() and is_active $$,
  array['Treatment'], 'the seeded concept starts as the active one');

select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ select public.set_active_concept('cc000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'viewer cannot change the active concept');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ select public.set_active_concept('cc000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'commenter cannot change the active concept');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ select public.set_active_concept('cc000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'outsider cannot change the active concept of project A');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ select public.set_active_concept('cc000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'deactivated editor cannot change the active concept');
select tests.authenticate_anon();
select throws_ok(
  $$ select public.set_active_concept('cc000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'anon cannot call set_active_concept');
select tests.reset_role();
select results_eq(
  $$ select title from public.concepts where project_id = tests.project_a() and is_active $$,
  array['Treatment'], 'the denied calls changed nothing');

select tests.authenticate_as('editor@tests.local');
select throws_ok(
  $$ select public.set_active_concept('cc000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'editor of A cannot change the active concept of project B');
select throws_ok(
  $$ select public.set_active_concept(gen_random_uuid()) $$,
  '42501', 'concept not found', 'an unknown concept is reported like a forbidden one');
select throws_ok(
  $$ insert into public.concepts (project_id, title, is_active)
     values (tests.project_a(), 'Second active', true) $$,
  '23505', null, 'a second active concept cannot be inserted directly');
select throws_ok(
  $$ update public.concepts set is_active = true
     where id = 'cc000000-0000-4000-8000-000000000001' $$,
  '23505', null, 'a second concept cannot be activated directly');
select lives_ok(
  $$ select public.set_active_concept('cc000000-0000-4000-8000-000000000001') $$,
  'editor makes a second concept the active one');
select results_eq(
  $$ select title, is_active from public.concepts
     where project_id = tests.project_a() and title in ('Brief A', 'Treatment')
     order by title $$,
  $$ values ('Brief A', true), ('Treatment', false) $$,
  'the chosen concept is active and the previous one is not');
select lives_ok(
  $$ select public.set_active_concept('cc000000-0000-4000-8000-000000000001') $$,
  'activating the active concept again is a no-op');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ select public.set_active_concept('cc000000-0000-4000-8000-000000000002') $$,
  'admin changes the active concept without being a project member');

select tests.reset_role();
select results_eq(
  $$ select project_id, count(*) from public.concepts where is_active
     group by project_id order by project_id $$,
  $$ values (tests.project_a(), 1::bigint), (tests.project_b(), 1::bigint) $$,
  'each project has exactly one active concept afterwards');

-- Defaults of a new project --------------------------------------------------

select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.projects (id, name, project_number, created_by)
     values ('c0000000-0000-4000-8000-00000000000c', 'Project C', 'T-003',
             tests.uid('editor')) $$,
  'a member creates a project');
select results_eq(
  $$ select title, type, status, is_active, created_by from public.concepts
     where project_id = 'c0000000-0000-4000-8000-00000000000c' $$,
  $$ values ('Treatment', 'treatment', 'draft', true, tests.uid('editor')) $$,
  'the new project has exactly one concept, and it is active');
select results_eq(
  $$ select title, created_by from public.moodboards
     where project_id = 'c0000000-0000-4000-8000-00000000000c' $$,
  $$ values ('Moodboard', tests.uid('editor')) $$,
  'the new project has exactly one moodboard');
select results_eq(
  $$ select name, is_done, created_by from public.task_sections
     where project_id = 'c0000000-0000-4000-8000-00000000000c' order by position $$,
  $$ values ('Open', false, tests.uid('editor')), ('In progress', false, tests.uid('editor')),
            ('Review', false, tests.uid('editor')), ('Done', true, tests.uid('editor')) $$,
  'the new project has the four columns in board order, only Done being a done column');
select is_empty(
  $$ select 1 from public.concept_folders where project_id = 'c0000000-0000-4000-8000-00000000000c'
     union all
     select 1 from public.tasks where project_id = 'c0000000-0000-4000-8000-00000000000c'
     union all
     select 1 from public.moodboard_nodes
       where project_id = 'c0000000-0000-4000-8000-00000000000c' $$,
  'the new project starts without folders, tasks or board nodes');
select tests.reset_role();
select is(
  (select count(*) from information_schema.columns
   where table_schema = 'public' and column_name = 'position' and collation_name = 'C'
     and table_name in ('concept_folders', 'concept_beats', 'beat_items', 'task_sections',
                        'tasks')),
  5::bigint, 'every position column sorts bytewise');

-- Deleting a project ---------------------------------------------------------

select results_eq(
  $$ select t.name from (values
       ('concept_folders', (select count(*) from public.concept_folders where project_id = tests.project_a())),
       ('concepts', (select count(*) from public.concepts where project_id = tests.project_a())),
       ('concept_beats', (select count(*) from public.concept_beats where project_id = tests.project_a())),
       ('beat_items', (select count(*) from public.beat_items where project_id = tests.project_a())),
       ('moodboards', (select count(*) from public.moodboards where project_id = tests.project_a())),
       ('moodboard_nodes', (select count(*) from public.moodboard_nodes where project_id = tests.project_a() and file_id is not null)),
       ('moodboard_edges', (select count(*) from public.moodboard_edges where project_id = tests.project_a())),
       ('task_sections', (select count(*) from public.task_sections where project_id = tests.project_a())),
       ('tasks', (select count(*) from public.tasks where project_id = tests.project_a() and parent_task_id is not null))
     ) as t (name, n) where t.n = 0 $$,
  array[]::text[],
  'project A holds rows in all nine tables, a node with a file and a subtask included');
select tests.authenticate_as('owner@tests.local');
select lives_ok(
  $$ delete from public.projects where id = tests.project_a() $$,
  'owner deletes project A and everything in it');
select tests.reset_role();
select is(
  (select count(*) from public.projects where id = tests.project_a())
  + (select count(*) from public.concept_folders where project_id = tests.project_a())
  + (select count(*) from public.concepts where project_id = tests.project_a())
  + (select count(*) from public.concept_beats where project_id = tests.project_a())
  + (select count(*) from public.beat_items where project_id = tests.project_a())
  + (select count(*) from public.moodboards where project_id = tests.project_a())
  + (select count(*) from public.moodboard_nodes where project_id = tests.project_a())
  + (select count(*) from public.moodboard_edges where project_id = tests.project_a())
  + (select count(*) from public.task_sections where project_id = tests.project_a())
  + (select count(*) from public.tasks where project_id = tests.project_a())
  + (select count(*) from public.files where project_id = tests.project_a()),
  0::bigint, 'nothing of project A is left in any of the nine tables');
select results_eq(
  $$ select (select count(*) from public.concepts where project_id = tests.project_b()),
            (select count(*) from public.moodboards where project_id = tests.project_b()),
            (select count(*) from public.task_sections where project_id = tests.project_b()),
            (select count(*) from public.tasks where project_id = tests.project_b()) $$,
  $$ values (2::bigint, 2::bigint, 4::bigint, 1::bigint) $$,
  'project B is untouched');

select * from finish();

rollback;
