-- RLS on public.concept_beats: every project role reads, only editors (and
-- workspace admins) write. project_id comes from the concept.

begin;

select plan(35);

select tests.setup_workspace();
insert into public.concepts (id, project_id, title) values
  ('cc000000-0000-4000-8000-000000000001', tests.project_a(), 'Brief A'),
  ('cc000000-0000-4000-8000-000000000002', tests.project_b(), 'Brief B');
insert into public.concept_beats (id, concept_id, title, start_sec, end_sec, position) values
  ('cb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001',
   'Hook A', 0, 5, 'G'),
  ('cb000000-0000-4000-8000-000000000002', 'cc000000-0000-4000-8000-000000000001',
   'Payoff A', 5, 30, 'V'),
  ('cb000000-0000-4000-8000-000000000003', 'cc000000-0000-4000-8000-000000000002',
   'Hook B', 0, 10, 'G');

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select title from public.concept_beats order by position',
  array['Hook A', 'Payoff A'], 'editor sees the beats of project A');
select tests.authenticate_as('commenter@tests.local');
select results_eq(
  'select title from public.concept_beats order by position',
  array['Hook A', 'Payoff A'], 'commenter sees the beats of project A');
select tests.authenticate_as('viewer@tests.local');
select results_eq(
  'select title from public.concept_beats order by position',
  array['Hook A', 'Payoff A'], 'viewer sees the beats of project A');
select tests.authenticate_as('outsider@tests.local');
select results_eq(
  'select title from public.concept_beats order by position',
  array['Hook B'], 'outsider sees project B only');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.concept_beats), 3::bigint, 'admin sees every beat');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.concept_beats', 'deactivated member sees no beats');
select tests.authenticate_as('stranger@tests.local');
select is_empty(
  'select id from public.concept_beats', 'user without a profile sees no beats');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.concept_beats (concept_id, title, start_sec, end_sec, position)
     values ('cc000000-0000-4000-8000-000000000001', 'New A', 30, 40, 'k') $$,
  'editor adds a beat to a concept of project A');
select results_eq(
  $$ select project_id, created_by from public.concept_beats where title = 'New A' $$,
  $$ values (tests.project_a(), tests.uid('editor')) $$,
  'the beat takes its project from the concept and its creator from the caller');
select throws_ok(
  $$ insert into public.concept_beats (concept_id, title, start_sec, end_sec, position)
     values ('cc000000-0000-4000-8000-000000000002', 'X', 0, 5, 'k') $$,
  '42501', null, 'editor of project A cannot add a beat to a concept of project B');
select throws_ok(
  $$ insert into public.concept_beats (concept_id, title, start_sec, end_sec, position)
     values ('cc000000-0000-4000-8000-000000000001', 'X', 10, 10, 'k') $$,
  '23514', null, 'a beat must end after it starts');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into public.concept_beats (concept_id, title, start_sec, end_sec, position)
     values ('cc000000-0000-4000-8000-000000000001', 'X', 0, 5, 'k') $$,
  '42501', null, 'commenter cannot add a beat');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.concept_beats (concept_id, title, start_sec, end_sec, position)
     values ('cc000000-0000-4000-8000-000000000001', 'X', 0, 5, 'k') $$,
  '42501', null, 'viewer cannot add a beat');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.concept_beats (concept_id, title, start_sec, end_sec, position)
     values ('cc000000-0000-4000-8000-000000000001', 'X', 0, 5, 'k') $$,
  '42501', null, 'outsider cannot add a beat to a concept of project A');
select lives_ok(
  $$ insert into public.concept_beats (concept_id, title, start_sec, end_sec, position)
     values ('cc000000-0000-4000-8000-000000000002', 'New B', 10, 20, 'k') $$,
  'outsider adds a beat to a concept of project B');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.concept_beats (concept_id, title, start_sec, end_sec, position)
     values ('cc000000-0000-4000-8000-000000000002', 'Admin B', 20, 30, 's') $$,
  'admin adds a beat without being a project member');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.concept_beats (concept_id, title, start_sec, end_sec, position)
     values ('cc000000-0000-4000-8000-000000000001', 'X', 0, 5, 'k') $$,
  '42501', null, 'deactivated editor cannot add a beat');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.concept_beats set title = 'Hook A renamed', end_sec = 4
     where id = 'cb000000-0000-4000-8000-000000000001' returning id $$,
  'editor updates a beat of project A');
select throws_ok(
  $$ update public.concept_beats set concept_id = 'cc000000-0000-4000-8000-000000000002'
     where id = 'cb000000-0000-4000-8000-000000000001' $$,
  '23514', 'a row cannot move to another project', 'editor cannot move a beat to a concept of project B');
select is_empty(
  $$ update public.concept_beats set title = 'hacked'
     where id = 'cb000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot update a beat of project B');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.concept_beats set title = 'hacked' returning id $$,
  'commenter cannot update beats');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.concept_beats set title = 'hacked' returning id $$,
  'viewer cannot update beats');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.concept_beats set title = 'hacked'
     where project_id = tests.project_a() returning id $$,
  'outsider cannot update beats of project A');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.concept_beats set title = 'Hook B renamed'
     where id = 'cb000000-0000-4000-8000-000000000003' returning id $$,
  'admin updates a beat of project B');

select tests.reset_role();
select results_eq(
  $$ select title, project_id from public.concept_beats
     where id::text like 'cb000000-%' order by id $$,
  $$ values ('Hook A renamed', tests.project_a()), ('Payoff A', tests.project_a()),
            ('Hook B renamed', tests.project_b()) $$,
  'only the allowed updates were stored');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty('delete from public.concept_beats returning id', 'viewer cannot delete beats');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  'delete from public.concept_beats returning id', 'commenter cannot delete beats');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.concept_beats where project_id = tests.project_a() returning id $$,
  'outsider cannot delete beats of project A');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ delete from public.concept_beats
     where id = 'cb000000-0000-4000-8000-000000000001' returning id $$,
  'editor deletes a beat of project A');
select is_empty(
  $$ delete from public.concept_beats
     where id = 'cb000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot delete a beat of project B');

select tests.reset_role();
select results_eq(
  $$ select id from public.concept_beats where id::text like 'cb000000-%' order by id $$,
  array['cb000000-0000-4000-8000-000000000002'::uuid,
        'cb000000-0000-4000-8000-000000000003'::uuid],
  'only the allowed delete took effect');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.concept_beats', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.concept_beats (concept_id, title, start_sec, end_sec, position)
     values ('cc000000-0000-4000-8000-000000000001', 'anon', 0, 5, 'G') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.concept_beats set title = 'anon' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.concept_beats', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
