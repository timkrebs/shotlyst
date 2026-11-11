-- RLS on public.shots: every project role reads, only editors (and workspace
-- admins) write. project_id and creative_id come from the segment.

begin;

select plan(35);

select tests.setup_workspace();
insert into public.shots (id, segment_id, position, action, duration_sec) values
  ('50000000-0000-4000-8000-000000000001', tests.segment_id(tests.project_a()), 'G',
   'Wide A', 4),
  ('50000000-0000-4000-8000-000000000002', tests.segment_id(tests.project_a()), 'V',
   'Close A', 3),
  ('50000000-0000-4000-8000-000000000003', tests.segment_id(tests.project_b()), 'G',
   'Wide B', 5);

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select action from public.shots order by position',
  array['Wide A', 'Close A'], 'editor sees the shots of project A');
select tests.authenticate_as('commenter@tests.local');
select results_eq(
  'select action from public.shots order by position',
  array['Wide A', 'Close A'], 'commenter sees the shots of project A');
select tests.authenticate_as('viewer@tests.local');
select results_eq(
  'select action from public.shots order by position',
  array['Wide A', 'Close A'], 'viewer sees the shots of project A');
select tests.authenticate_as('outsider@tests.local');
select results_eq(
  'select action from public.shots order by position',
  array['Wide B'], 'outsider sees project B only');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.shots), 3::bigint, 'admin sees every shot');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.shots', 'deactivated member sees no shots');
select tests.authenticate_as('stranger@tests.local');
select is_empty('select id from public.shots', 'user without a profile sees no shots');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.shots (id, segment_id, position, action)
     values ('50000000-0000-4000-8000-00000000000a', tests.segment_id(tests.project_a()),
             'k', 'New A') $$,
  'editor adds a shot with an id of their choosing to a segment of project A');
select results_eq(
  $$ select project_id, creative_id, status, duration_sec, created_by
     from public.shots where id = '50000000-0000-4000-8000-00000000000a' $$,
  $$ values (tests.project_a(), tests.creative_id(tests.project_a()), 'planned', 0,
             tests.uid('editor')) $$,
  'the shot takes project and creative from the segment and starts as planned');
select throws_ok(
  $$ insert into public.shots (segment_id, position)
     values (tests.segment_id(tests.project_b()), 'k') $$,
  '42501', null, 'editor of project A cannot add a shot to a segment of project B');
select throws_ok(
  $$ insert into public.shots (segment_id, position, int_ext)
     values (tests.segment_id(tests.project_a()), 'k', 'underwater') $$,
  '23514', null, 'a shot needs a known interior/exterior value');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into public.shots (segment_id, position)
     values (tests.segment_id(tests.project_a()), 'k') $$,
  '42501', null, 'commenter cannot add a shot');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.shots (segment_id, position)
     values (tests.segment_id(tests.project_a()), 'k') $$,
  '42501', null, 'viewer cannot add a shot');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.shots (segment_id, position)
     values (tests.segment_id(tests.project_a()), 'k') $$,
  '42501', null, 'outsider cannot add a shot to a segment of project A');
select lives_ok(
  $$ insert into public.shots (segment_id, position, action)
     values (tests.segment_id(tests.project_b()), 'k', 'New B') $$,
  'outsider adds a shot to a segment of project B');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.shots (segment_id, position, action)
     values (tests.segment_id(tests.project_b()), 's', 'Admin B') $$,
  'admin adds a shot without being a project member');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.shots (segment_id, position)
     values (tests.segment_id(tests.project_a()), 'k') $$,
  '42501', null, 'deactivated editor cannot add a shot');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.shots
     set action = 'Wide A renamed', status = 'ready', custom_values = '{"vfx": true}'
     where id = '50000000-0000-4000-8000-000000000001' returning id $$,
  'editor updates a shot of project A');
select throws_ok(
  $$ update public.shots set segment_id = tests.segment_id(tests.project_b())
     where id = '50000000-0000-4000-8000-000000000001' $$,
  '23514', 'a row cannot move to another project', 'editor cannot move a shot to a segment of project B');
select is_empty(
  $$ update public.shots set action = 'hacked'
     where id = '50000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot update a shot of project B');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.shots set action = 'hacked' returning id $$,
  'commenter cannot update shots');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.shots set status = 'shot' returning id $$, 'viewer cannot update shots');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.shots set action = 'hacked'
     where project_id = tests.project_a() returning id $$,
  'outsider cannot update shots of project A');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.shots set action = 'Wide B renamed'
     where id = '50000000-0000-4000-8000-000000000003' returning id $$,
  'admin updates a shot of project B');

select tests.reset_role();
select results_eq(
  $$ select action, status, project_id from public.shots
     where id::text like '50000000-0000-4000-8000-00000000000_' and action <> 'New A'
     order by id $$,
  $$ values ('Wide A renamed', 'ready', tests.project_a()),
            ('Close A', 'planned', tests.project_a()),
            ('Wide B renamed', 'planned', tests.project_b()) $$,
  'only the allowed updates were stored');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty('delete from public.shots returning id', 'viewer cannot delete shots');
select tests.authenticate_as('commenter@tests.local');
select is_empty('delete from public.shots returning id', 'commenter cannot delete shots');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.shots where project_id = tests.project_a() returning id $$,
  'outsider cannot delete shots of project A');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ delete from public.shots
     where id = '50000000-0000-4000-8000-000000000001' returning id $$,
  'editor deletes a shot of project A');
select is_empty(
  $$ delete from public.shots
     where id = '50000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot delete a shot of project B');

select tests.reset_role();
select results_eq(
  $$ select project_id, count(*) from public.shots group by project_id order by project_id $$,
  $$ values (tests.project_a(), 2::bigint), (tests.project_b(), 3::bigint) $$,
  'only the allowed delete took effect');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.shots', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.shots (segment_id, position)
     values (tests.segment_id(tests.project_a()), 'G') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.shots set action = 'anon' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.shots', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
