-- RLS on public.projects: any active member creates; afterwards the project
-- roles decide. Owner and admin act as editor everywhere.

begin;

select plan(35);

select tests.setup_workspace();

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq('select id from public.projects', array[tests.project_a()],
  'editor sees only project A');
select tests.authenticate_as('commenter@tests.local');
select results_eq('select id from public.projects', array[tests.project_a()],
  'commenter sees only project A');
select tests.authenticate_as('viewer@tests.local');
select results_eq('select id from public.projects', array[tests.project_a()],
  'viewer sees only project A');
select tests.authenticate_as('outsider@tests.local');
select results_eq('select id from public.projects', array[tests.project_b()],
  'outsider sees only project B');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.projects), 2::bigint, 'admin sees every project');
select tests.authenticate_as('owner@tests.local');
select is((select count(*) from public.projects), 2::bigint, 'owner sees every project');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.projects',
  'deactivated editor of project A sees nothing');
select tests.authenticate_as('stranger@tests.local');
select is_empty('select id from public.projects', 'user without a profile sees nothing');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.projects (name, project_number) values ('By editor', 'T-101') $$,
  'editor creates a project');
select throws_ok(
  $$ insert into public.projects (name, project_number, created_by)
     values ('Forged', 'T-102', tests.uid('owner')) $$,
  '42501', null, 'editor cannot create a project in another name');
select tests.authenticate_as('viewer@tests.local');
select lives_ok(
  $$ insert into public.projects (name, project_number) values ('By viewer', 'T-103') $$,
  'viewer of project A creates a project of their own');
select is((select count(*) from public.projects), 2::bigint,
  'the creator reads the new project through the trigger membership');
select tests.authenticate_as('outsider@tests.local');
select lives_ok(
  $$ insert into public.projects (name, project_number) values ('By outsider', 'T-104') $$,
  'outsider creates a project');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.projects (name, project_number) values ('By deactivated', 'T-105') $$,
  '42501', null, 'deactivated member cannot create a project');
select tests.authenticate_as('stranger@tests.local');
select throws_ok(
  $$ insert into public.projects (name, project_number) values ('By stranger', 'T-106') $$,
  '42501', null, 'user without a profile cannot create a project');

select tests.reset_role();
select results_eq(
  $$ select p.name, m.role::text from public.projects p
     join public.project_members m on m.project_id = p.id and m.user_id = p.created_by
     where p.project_number in ('T-101', 'T-103', 'T-104') order by p.project_number $$,
  $$ values ('By editor', 'editor'), ('By viewer', 'editor'), ('By outsider', 'editor') $$,
  'each creator became editor of their project');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.projects set name = 'A renamed' where id = tests.project_a() returning id $$,
  'editor updates project A');
select is_empty(
  $$ update public.projects set name = 'Hacked' where id = tests.project_b() returning id $$,
  'editor of project A cannot update project B');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.projects set name = 'Hacked' where id = tests.project_a() returning id $$,
  'commenter cannot update project A');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.projects set name = 'Hacked' where id = tests.project_a() returning id $$,
  'viewer cannot update project A');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.projects set name = 'Hacked' where id = tests.project_a() returning id $$,
  'outsider cannot update project A');
select isnt_empty(
  $$ update public.projects set status = 'production' where id = tests.project_b()
     returning id $$,
  'outsider updates project B, where they are editor');
select tests.authenticate_as('deactivated@tests.local');
select is_empty(
  $$ update public.projects set name = 'Hacked' where id = tests.project_a() returning id $$,
  'deactivated editor cannot update project A');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.projects set description = 'By admin' where id = tests.project_b()
     returning id $$,
  'admin updates a project without being a member');

select tests.reset_role();
select results_eq(
  $$ select name, status, description from public.projects
     where id in (tests.project_a(), tests.project_b()) order by project_number $$,
  $$ values ('A renamed', 'planning', null), ('Project B', 'production', 'By admin') $$,
  'only the allowed updates were stored');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ delete from public.projects where id = tests.project_a() returning id $$,
  'viewer cannot delete project A');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ delete from public.projects where id = tests.project_a() returning id $$,
  'commenter cannot delete project A');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.projects where id = tests.project_a() returning id $$,
  'outsider cannot delete project A');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ delete from public.projects where id = tests.project_a() returning id $$,
  'editor deletes project A');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ delete from public.projects where id = tests.project_b() returning id $$,
  'admin deletes project B');

select tests.reset_role();
select is_empty(
  $$ select id from public.project_members
     where project_id in (tests.project_a(), tests.project_b()) $$,
  'memberships went with their projects');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.projects', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.projects (name, project_number) values ('Anon', 'T-999') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.projects set name = 'Anon' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.projects', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
