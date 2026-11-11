-- RLS on public.segments: every project role reads, only editors (and
-- workspace admins) write. project_id comes from the creative. Each project
-- starts with "Segment 1" in its creative "Main film".

begin;

select plan(36);

select tests.setup_workspace();
insert into public.segments (id, creative_id, title, target_duration_sec, position) values
  ('5e000000-0000-4000-8000-000000000001', tests.creative_id(tests.project_a()),
   'Payoff A', 20, 'k'),
  ('5e000000-0000-4000-8000-000000000002', tests.creative_id(tests.project_b()),
   'Payoff B', 20, 'k');

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select title from public.segments order by position',
  array['Segment 1', 'Payoff A'], 'editor sees the segments of project A');
select tests.authenticate_as('commenter@tests.local');
select results_eq(
  'select title from public.segments order by position',
  array['Segment 1', 'Payoff A'], 'commenter sees the segments of project A');
select tests.authenticate_as('viewer@tests.local');
select results_eq(
  'select title from public.segments order by position',
  array['Segment 1', 'Payoff A'], 'viewer sees the segments of project A');
select tests.authenticate_as('outsider@tests.local');
select results_eq(
  'select title from public.segments order by position',
  array['Segment 1', 'Payoff B'], 'outsider sees project B only');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.segments), 4::bigint, 'admin sees every segment');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.segments', 'deactivated member sees no segments');
select tests.authenticate_as('stranger@tests.local');
select is_empty('select id from public.segments', 'user without a profile sees no segments');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.segments (creative_id, title, position)
     values (tests.creative_id(tests.project_a()), 'New A', 's') $$,
  'editor adds a segment to a creative of project A');
select results_eq(
  $$ select project_id, created_by from public.segments where title = 'New A' $$,
  $$ values (tests.project_a(), tests.uid('editor')) $$,
  'the segment takes its project from the creative and its creator from the caller');
select throws_ok(
  $$ insert into public.segments (creative_id, title, position)
     values (tests.creative_id(tests.project_b()), 'X', 's') $$,
  '42501', null, 'editor of project A cannot add a segment to a creative of project B');
select throws_ok(
  $$ insert into public.segments (creative_id, title, position, target_duration_sec)
     values (tests.creative_id(tests.project_a()), 'X', 's', -1) $$,
  '23514', null, 'a target duration cannot be negative');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into public.segments (creative_id, title, position)
     values (tests.creative_id(tests.project_a()), 'X', 's') $$,
  '42501', null, 'commenter cannot add a segment');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.segments (creative_id, title, position)
     values (tests.creative_id(tests.project_a()), 'X', 's') $$,
  '42501', null, 'viewer cannot add a segment');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.segments (creative_id, title, position)
     values (tests.creative_id(tests.project_a()), 'X', 's') $$,
  '42501', null, 'outsider cannot add a segment to a creative of project A');
select lives_ok(
  $$ insert into public.segments (creative_id, title, position)
     values (tests.creative_id(tests.project_b()), 'New B', 's') $$,
  'outsider adds a segment to a creative of project B');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.segments (creative_id, title, position)
     values (tests.creative_id(tests.project_b()), 'Admin B', 'x') $$,
  'admin adds a segment without being a project member');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.segments (creative_id, title, position)
     values (tests.creative_id(tests.project_a()), 'X', 's') $$,
  '42501', null, 'deactivated editor cannot add a segment');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.segments set title = 'Payoff A renamed', target_duration_sec = 25
     where id = '5e000000-0000-4000-8000-000000000001' returning id $$,
  'editor updates a segment of project A');
select throws_ok(
  $$ update public.segments set creative_id = tests.creative_id(tests.project_b())
     where id = '5e000000-0000-4000-8000-000000000001' $$,
  '23514', 'creative_id cannot change', 'editor cannot move a segment to a creative of project B');
select is_empty(
  $$ update public.segments set title = 'hacked'
     where id = '5e000000-0000-4000-8000-000000000002' returning id $$,
  'editor of project A cannot update a segment of project B');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.segments set title = 'hacked' returning id $$,
  'commenter cannot update segments');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.segments set title = 'hacked' returning id $$,
  'viewer cannot update segments');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.segments set title = 'hacked'
     where project_id = tests.project_a() returning id $$,
  'outsider cannot update segments of project A');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.segments set title = 'Payoff B renamed'
     where id = '5e000000-0000-4000-8000-000000000002' returning id $$,
  'admin updates a segment of project B');

select tests.reset_role();
select results_eq(
  $$ select title, project_id from public.segments
     where id::text like '5e000000-%' order by id $$,
  $$ values ('Payoff A renamed', tests.project_a()),
            ('Payoff B renamed', tests.project_b()) $$,
  'only the allowed updates were stored');
select is(
  (select count(*) from public.segments where title = 'Segment 1'), 2::bigint,
  'the seeded segments kept their title');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty('delete from public.segments returning id', 'viewer cannot delete segments');
select tests.authenticate_as('commenter@tests.local');
select is_empty('delete from public.segments returning id', 'commenter cannot delete segments');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.segments where project_id = tests.project_a() returning id $$,
  'outsider cannot delete segments of project A');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ delete from public.segments
     where id = '5e000000-0000-4000-8000-000000000001' returning id $$,
  'editor deletes a segment of project A');
select is_empty(
  $$ delete from public.segments
     where id = '5e000000-0000-4000-8000-000000000002' returning id $$,
  'editor of project A cannot delete a segment of project B');

select tests.reset_role();
select results_eq(
  $$ select project_id, count(*) from public.segments group by project_id order by project_id $$,
  $$ values (tests.project_a(), 2::bigint), (tests.project_b(), 4::bigint) $$,
  'only the allowed delete took effect');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.segments', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.segments (creative_id, title, position)
     values (tests.creative_id(tests.project_a()), 'anon', 'G') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.segments set title = 'anon' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.segments', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
