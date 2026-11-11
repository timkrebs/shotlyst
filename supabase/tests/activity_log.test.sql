-- RLS on public.activity_log: append-only. Project events are read inside
-- the project, workspace events (project_id null) by owner and admin.

begin;

select plan(33);

select tests.setup_workspace();
insert into public.activity_log (project_id, actor_id, action, entity_type, summary) values
  (tests.project_a(), tests.uid('owner'), 'project.created', 'project', 'Seed A'),
  (tests.project_b(), tests.uid('owner'), 'project.created', 'project', 'Seed B'),
  (null, tests.uid('owner'), 'workspace.claimed', 'profile', 'Seed workspace');

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq('select summary from public.activity_log', array['Seed A'],
  'editor reads the events of project A only');
select tests.authenticate_as('viewer@tests.local');
select results_eq('select summary from public.activity_log', array['Seed A'],
  'viewer reads the events of project A only');
select tests.authenticate_as('outsider@tests.local');
select results_eq('select summary from public.activity_log', array['Seed B'],
  'outsider reads the events of project B only');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.activity_log), 3::bigint,
  'admin reads project and workspace events');
select tests.authenticate_as('owner@tests.local');
select is((select count(*) from public.activity_log), 3::bigint,
  'owner reads project and workspace events');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.activity_log', 'deactivated member reads nothing');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.activity_log (project_id, action, entity_type, summary)
     values (tests.project_a(), 'test', 'project', 'By editor') $$,
  'editor logs an event in project A');
select throws_ok(
  $$ insert into public.activity_log (project_id, actor_id, action, entity_type, summary)
     values (tests.project_a(), tests.uid('owner'), 'test', 'project', 'Forged') $$,
  '42501', null, 'editor cannot log an event in another name');
select throws_ok(
  $$ insert into public.activity_log (project_id, action, entity_type, summary)
     values (tests.project_b(), 'test', 'project', 'Wrong project') $$,
  '42501', null, 'editor of project A cannot log an event in project B');
select lives_ok(
  $$ insert into public.activity_log (action, entity_type, summary)
     values ('test', 'brand', 'Workspace event by editor') $$,
  'editor logs a workspace event');
select is_empty(
  $$ select id from public.activity_log where project_id is null $$,
  'editor cannot read workspace events, not even their own');
select tests.authenticate_as('viewer@tests.local');
select lives_ok(
  $$ insert into public.activity_log (project_id, action, entity_type, summary)
     values (tests.project_a(), 'test', 'project', 'By viewer') $$,
  'viewer logs an event in project A');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.activity_log (project_id, action, entity_type, summary)
     values (tests.project_a(), 'test', 'project', 'By outsider') $$,
  '42501', null, 'outsider cannot log an event in project A');
select lives_ok(
  $$ insert into public.activity_log (project_id, action, entity_type, summary)
     values (tests.project_b(), 'test', 'project', 'By outsider') $$,
  'outsider logs an event in project B');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.activity_log (project_id, action, entity_type, summary)
     values (tests.project_a(), 'test', 'project', 'By deactivated') $$,
  '42501', null, 'deactivated member cannot log a project event');
select throws_ok(
  $$ insert into public.activity_log (action, entity_type, summary)
     values ('test', 'brand', 'By deactivated') $$,
  '42501', null, 'deactivated member cannot log a workspace event');
select tests.authenticate_as('stranger@tests.local');
select throws_ok(
  $$ insert into public.activity_log (action, entity_type, summary)
     values ('test', 'brand', 'By stranger') $$,
  '42501', null, 'user without a profile cannot log an event');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.activity_log (action, entity_type, summary)
     values ('test', 'invitation', 'Workspace event by admin') $$,
  'admin logs a workspace event');
select is(
  (select count(*) from public.activity_log where project_id is null), 3::bigint,
  'admin reads every workspace event');

-- update: no policy, the log is append-only
select tests.authenticate_as('editor@tests.local');
select is_empty(
  $$ update public.activity_log set summary = 'Rewritten' returning id $$,
  'editor cannot rewrite events, not even their own');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.activity_log set summary = 'Rewritten' returning id $$,
  'viewer cannot rewrite events');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.activity_log set summary = 'Rewritten' returning id $$,
  'outsider cannot rewrite events');
select tests.authenticate_as('owner@tests.local');
select is_empty(
  $$ update public.activity_log set summary = 'Rewritten' returning id $$,
  'owner cannot rewrite events');

-- delete: no policy
select tests.authenticate_as('editor@tests.local');
select is_empty('delete from public.activity_log returning id', 'editor cannot delete events');
select tests.authenticate_as('viewer@tests.local');
select is_empty('delete from public.activity_log returning id', 'viewer cannot delete events');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  'delete from public.activity_log returning id', 'outsider cannot delete events');
select tests.authenticate_as('owner@tests.local');
select is_empty('delete from public.activity_log returning id', 'owner cannot delete events');

select tests.reset_role();
select is((select count(*) from public.activity_log), 8::bigint, 'every event survived');
select is_empty(
  $$ select id from public.activity_log where summary = 'Rewritten' $$,
  'no event was rewritten');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.activity_log', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.activity_log (action, entity_type, summary)
     values ('test', 'brand', 'Anon') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.activity_log set summary = 'Anon' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.activity_log', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
