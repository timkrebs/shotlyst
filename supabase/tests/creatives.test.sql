-- RLS on public.creatives: every project role reads, only editors (and
-- workspace admins) write. Each project starts with the creative "Main film".

begin;

select plan(35);

select tests.setup_workspace();
insert into public.creatives (id, project_id, title, position) values
  ('c1000000-0000-4000-8000-000000000001', tests.project_a(), 'Cutdown A', 'k'),
  ('c1000000-0000-4000-8000-000000000002', tests.project_b(), 'Cutdown B', 'k');

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select title from public.creatives order by position',
  array['Main film', 'Cutdown A'], 'editor sees the creatives of project A');
select tests.authenticate_as('commenter@tests.local');
select results_eq(
  'select title from public.creatives order by position',
  array['Main film', 'Cutdown A'], 'commenter sees the creatives of project A');
select tests.authenticate_as('viewer@tests.local');
select results_eq(
  'select title from public.creatives order by position',
  array['Main film', 'Cutdown A'], 'viewer sees the creatives of project A');
select tests.authenticate_as('outsider@tests.local');
select results_eq(
  'select title from public.creatives order by position',
  array['Main film', 'Cutdown B'], 'outsider sees project B only');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.creatives), 4::bigint, 'admin sees every creative');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.creatives', 'deactivated member sees no creatives');
select tests.authenticate_as('stranger@tests.local');
select is_empty('select id from public.creatives', 'user without a profile sees no creatives');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.creatives (project_id, title, position)
     values (tests.project_a(), 'New A', 's') $$,
  'editor adds a creative to project A');
select results_eq(
  $$ select status, aspect_ratio, created_by from public.creatives where title = 'New A' $$,
  $$ values ('draft', null::text, tests.uid('editor')) $$,
  'a new creative is a draft without its own aspect ratio, created by the caller');
select throws_ok(
  $$ insert into public.creatives (project_id, title, position)
     values (tests.project_b(), 'X', 's') $$,
  '42501', null, 'editor of project A cannot add a creative to project B');
select throws_ok(
  $$ insert into public.creatives (project_id, title, position, status)
     values (tests.project_a(), 'X', 's', 'published') $$,
  '23514', null, 'a creative needs a known status');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into public.creatives (project_id, title, position)
     values (tests.project_a(), 'X', 's') $$,
  '42501', null, 'commenter cannot add a creative');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.creatives (project_id, title, position)
     values (tests.project_a(), 'X', 's') $$,
  '42501', null, 'viewer cannot add a creative');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.creatives (project_id, title, position)
     values (tests.project_a(), 'X', 's') $$,
  '42501', null, 'outsider cannot add a creative to project A');
select lives_ok(
  $$ insert into public.creatives (project_id, title, position)
     values (tests.project_b(), 'New B', 's') $$,
  'outsider adds a creative to project B');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.creatives (project_id, title, position)
     values (tests.project_b(), 'Admin B', 'x') $$,
  'admin adds a creative without being a project member');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.creatives (project_id, title, position)
     values (tests.project_a(), 'X', 's') $$,
  '42501', null, 'deactivated editor cannot add a creative');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.creatives set title = 'Cutdown A renamed', status = 'in_review'
     where id = 'c1000000-0000-4000-8000-000000000001' returning id $$,
  'editor updates a creative of project A');
select is_empty(
  $$ update public.creatives set title = 'hacked'
     where id = 'c1000000-0000-4000-8000-000000000002' returning id $$,
  'editor of project A cannot update a creative of project B');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.creatives set title = 'hacked' returning id $$,
  'commenter cannot update creatives');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.creatives set title = 'hacked' returning id $$,
  'viewer cannot update creatives');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.creatives set title = 'hacked'
     where project_id = tests.project_a() returning id $$,
  'outsider cannot update creatives of project A');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.creatives set title = 'Cutdown B renamed'
     where id = 'c1000000-0000-4000-8000-000000000002' returning id $$,
  'admin updates a creative of project B');

select tests.reset_role();
select results_eq(
  $$ select title, project_id from public.creatives
     where id::text like 'c1000000-%' order by id $$,
  $$ values ('Cutdown A renamed', tests.project_a()),
            ('Cutdown B renamed', tests.project_b()) $$,
  'only the allowed updates were stored');
select is(
  (select count(*) from public.creatives where title = 'Main film'), 2::bigint,
  'the seeded creatives kept their title');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty('delete from public.creatives returning id', 'viewer cannot delete creatives');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  'delete from public.creatives returning id', 'commenter cannot delete creatives');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.creatives where project_id = tests.project_a() returning id $$,
  'outsider cannot delete creatives of project A');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ delete from public.creatives
     where id = 'c1000000-0000-4000-8000-000000000001' returning id $$,
  'editor deletes a creative of project A');
select is_empty(
  $$ delete from public.creatives
     where id = 'c1000000-0000-4000-8000-000000000002' returning id $$,
  'editor of project A cannot delete a creative of project B');

select tests.reset_role();
select results_eq(
  $$ select project_id, count(*) from public.creatives group by project_id order by project_id $$,
  $$ values (tests.project_a(), 2::bigint), (tests.project_b(), 4::bigint) $$,
  'only the allowed delete took effect');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.creatives', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.creatives (project_id, title, position)
     values (tests.project_a(), 'anon', 'G') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.creatives set title = 'anon' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.creatives', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
