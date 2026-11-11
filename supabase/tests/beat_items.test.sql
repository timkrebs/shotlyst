-- RLS on public.beat_items: every project role reads, only editors (and
-- workspace admins) write, ticking an item included. project_id comes from
-- the beat.

begin;

select plan(36);

select tests.setup_workspace();
insert into public.concepts (id, project_id, title) values
  ('cc000000-0000-4000-8000-000000000001', tests.project_a(), 'Brief A'),
  ('cc000000-0000-4000-8000-000000000002', tests.project_b(), 'Brief B');
insert into public.concept_beats (id, concept_id, title, start_sec, end_sec, position) values
  ('cb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001',
   'Hook A', 0, 5, 'G'),
  ('cb000000-0000-4000-8000-000000000002', 'cc000000-0000-4000-8000-000000000002',
   'Hook B', 0, 10, 'G');
insert into public.beat_items (id, beat_id, label, position) values
  ('b1000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001',
   'Find the pier A', 'G'),
  ('b1000000-0000-4000-8000-000000000002', 'cb000000-0000-4000-8000-000000000001',
   'Book the boat A', 'V'),
  ('b1000000-0000-4000-8000-000000000003', 'cb000000-0000-4000-8000-000000000002',
   'Find the ferry B', 'G');

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select label from public.beat_items order by position',
  array['Find the pier A', 'Book the boat A'], 'editor sees the items of project A');
select tests.authenticate_as('commenter@tests.local');
select results_eq(
  'select label from public.beat_items order by position',
  array['Find the pier A', 'Book the boat A'], 'commenter sees the items of project A');
select tests.authenticate_as('viewer@tests.local');
select results_eq(
  'select label from public.beat_items order by position',
  array['Find the pier A', 'Book the boat A'], 'viewer sees the items of project A');
select tests.authenticate_as('outsider@tests.local');
select results_eq(
  'select label from public.beat_items order by position',
  array['Find the ferry B'], 'outsider sees project B only');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.beat_items), 3::bigint, 'admin sees every item');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.beat_items', 'deactivated member sees no items');
select tests.authenticate_as('stranger@tests.local');
select is_empty('select id from public.beat_items', 'user without a profile sees no items');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.beat_items (beat_id, label, position)
     values ('cb000000-0000-4000-8000-000000000001', 'New A', 'k') $$,
  'editor adds an item to a beat of project A');
select results_eq(
  $$ select project_id, done, created_by from public.beat_items where label = 'New A' $$,
  $$ values (tests.project_a(), false, tests.uid('editor')) $$,
  'the item is open, takes its project from the beat and its creator from the caller');
select throws_ok(
  $$ insert into public.beat_items (beat_id, label, position)
     values ('cb000000-0000-4000-8000-000000000002', 'X', 'k') $$,
  '42501', null, 'editor of project A cannot add an item to a beat of project B');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into public.beat_items (beat_id, label, position)
     values ('cb000000-0000-4000-8000-000000000001', 'X', 'k') $$,
  '42501', null, 'commenter cannot add an item');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.beat_items (beat_id, label, position)
     values ('cb000000-0000-4000-8000-000000000001', 'X', 'k') $$,
  '42501', null, 'viewer cannot add an item');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.beat_items (beat_id, label, position)
     values ('cb000000-0000-4000-8000-000000000001', 'X', 'k') $$,
  '42501', null, 'outsider cannot add an item to a beat of project A');
select lives_ok(
  $$ insert into public.beat_items (beat_id, label, position)
     values ('cb000000-0000-4000-8000-000000000002', 'New B', 'k') $$,
  'outsider adds an item to a beat of project B');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.beat_items (beat_id, label, position)
     values ('cb000000-0000-4000-8000-000000000002', 'Admin B', 's') $$,
  'admin adds an item without being a project member');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.beat_items (beat_id, label, position)
     values ('cb000000-0000-4000-8000-000000000001', 'X', 'k') $$,
  '42501', null, 'deactivated editor cannot add an item');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.beat_items set done = true
     where id = 'b1000000-0000-4000-8000-000000000001' returning id $$,
  'editor ticks an item of project A');
select throws_ok(
  $$ update public.beat_items set beat_id = 'cb000000-0000-4000-8000-000000000002'
     where id = 'b1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'editor cannot move an item to a beat of project B');
select is_empty(
  $$ update public.beat_items set done = true
     where id = 'b1000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot update an item of project B');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.beat_items set done = true returning id $$,
  'commenter cannot tick items');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.beat_items set done = true returning id $$,
  'viewer cannot tick items');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.beat_items set done = true
     where project_id = tests.project_a() returning id $$,
  'outsider cannot update items of project A');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.beat_items set done = true
     where id = 'b1000000-0000-4000-8000-000000000003' returning id $$,
  'admin ticks an item of project B');

select tests.reset_role();
select results_eq(
  $$ select done, project_id from public.beat_items
     where id::text like 'b1000000-%' order by id $$,
  $$ values (true, tests.project_a()), (false, tests.project_a()),
            (true, tests.project_b()) $$,
  'only the allowed updates were stored');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty('delete from public.beat_items returning id', 'viewer cannot delete items');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  'delete from public.beat_items returning id', 'commenter cannot delete items');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.beat_items where project_id = tests.project_a() returning id $$,
  'outsider cannot delete items of project A');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ delete from public.beat_items
     where id = 'b1000000-0000-4000-8000-000000000001' returning id $$,
  'editor deletes an item of project A');
select is_empty(
  $$ delete from public.beat_items
     where id = 'b1000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot delete an item of project B');

select tests.reset_role();
select results_eq(
  $$ select id from public.beat_items where id::text like 'b1000000-%' order by id $$,
  array['b1000000-0000-4000-8000-000000000002'::uuid,
        'b1000000-0000-4000-8000-000000000003'::uuid],
  'only the allowed delete took effect');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ delete from public.concept_beats
     where id = 'cb000000-0000-4000-8000-000000000001' returning id $$,
  'editor deletes a beat that still has items');
select is_empty('select id from public.beat_items', 'the items went with their beat');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.beat_items', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.beat_items (beat_id, label, position)
     values ('cb000000-0000-4000-8000-000000000001', 'anon', 'G') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.beat_items set done = true $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.beat_items', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
