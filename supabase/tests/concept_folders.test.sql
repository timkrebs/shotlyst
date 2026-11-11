-- RLS on public.concept_folders: every project role reads, only editors
-- (and workspace admins) write.

begin;

select plan(34);

select tests.setup_workspace();
insert into public.concept_folders (id, project_id, name, position) values
  ('cf000000-0000-4000-8000-000000000001', tests.project_a(), 'Drafts A', 'G'),
  ('cf000000-0000-4000-8000-000000000002', tests.project_a(), 'Archive A', 'V'),
  ('cf000000-0000-4000-8000-000000000003', tests.project_b(), 'Drafts B', 'G');

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select name from public.concept_folders order by name',
  array['Archive A', 'Drafts A'], 'editor sees the folders of project A');
select tests.authenticate_as('commenter@tests.local');
select results_eq(
  'select name from public.concept_folders order by name',
  array['Archive A', 'Drafts A'], 'commenter sees the folders of project A');
select tests.authenticate_as('viewer@tests.local');
select results_eq(
  'select name from public.concept_folders order by name',
  array['Archive A', 'Drafts A'], 'viewer sees the folders of project A');
select tests.authenticate_as('outsider@tests.local');
select results_eq(
  'select name from public.concept_folders order by name',
  array['Drafts B'], 'outsider sees project B only');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.concept_folders), 3::bigint, 'admin sees every folder');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.concept_folders', 'deactivated member sees no folders');
select tests.authenticate_as('stranger@tests.local');
select is_empty(
  'select id from public.concept_folders', 'user without a profile sees no folders');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.concept_folders (project_id, name, position)
     values (tests.project_a(), 'New A', 'k') $$,
  'editor adds a folder to project A');
select is(
  (select created_by from public.concept_folders where name = 'New A'), tests.uid('editor'),
  'created_by defaults to the caller');
select throws_ok(
  $$ insert into public.concept_folders (project_id, name, position)
     values (tests.project_b(), 'X', 'k') $$,
  '42501', null, 'editor of project A cannot add a folder to project B');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into public.concept_folders (project_id, name, position)
     values (tests.project_a(), 'X', 'k') $$,
  '42501', null, 'commenter cannot add a folder');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.concept_folders (project_id, name, position)
     values (tests.project_a(), 'X', 'k') $$,
  '42501', null, 'viewer cannot add a folder');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.concept_folders (project_id, name, position)
     values (tests.project_a(), 'X', 'k') $$,
  '42501', null, 'outsider cannot add a folder to project A');
select lives_ok(
  $$ insert into public.concept_folders (project_id, name, position)
     values (tests.project_b(), 'New B', 'k') $$,
  'outsider adds a folder to project B');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.concept_folders (project_id, name, position)
     values (tests.project_b(), 'Admin B', 's') $$,
  'admin adds a folder without being a project member');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.concept_folders (project_id, name, position)
     values (tests.project_a(), 'X', 'k') $$,
  '42501', null, 'deactivated editor cannot add a folder');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.concept_folders set name = 'Drafts A renamed'
     where id = 'cf000000-0000-4000-8000-000000000001' returning id $$,
  'editor renames a folder of project A');
select throws_ok(
  $$ update public.concept_folders set project_id = tests.project_b()
     where id = 'cf000000-0000-4000-8000-000000000001' $$,
  '23514', 'a row cannot move to another project', 'editor cannot move a folder into project B');
select is_empty(
  $$ update public.concept_folders set name = 'hacked'
     where id = 'cf000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot update a folder of project B');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.concept_folders set name = 'hacked' returning id $$,
  'commenter cannot update folders');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.concept_folders set name = 'hacked' returning id $$,
  'viewer cannot update folders');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.concept_folders set name = 'hacked'
     where project_id = tests.project_a() returning id $$,
  'outsider cannot update folders of project A');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.concept_folders set name = 'Drafts B renamed'
     where id = 'cf000000-0000-4000-8000-000000000003' returning id $$,
  'admin renames a folder of project B');

select tests.reset_role();
select results_eq(
  $$ select name from public.concept_folders where id::text like 'cf000000-%' order by id $$,
  array['Drafts A renamed', 'Archive A', 'Drafts B renamed'],
  'only the allowed updates were stored');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  'delete from public.concept_folders returning id', 'viewer cannot delete folders');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  'delete from public.concept_folders returning id', 'commenter cannot delete folders');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.concept_folders where project_id = tests.project_a() returning id $$,
  'outsider cannot delete folders of project A');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ delete from public.concept_folders
     where id = 'cf000000-0000-4000-8000-000000000001' returning id $$,
  'editor deletes a folder of project A');
select is_empty(
  $$ delete from public.concept_folders
     where id = 'cf000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot delete a folder of project B');

select tests.reset_role();
select results_eq(
  $$ select id from public.concept_folders where id::text like 'cf000000-%' order by id $$,
  array['cf000000-0000-4000-8000-000000000002'::uuid,
        'cf000000-0000-4000-8000-000000000003'::uuid],
  'only the allowed delete took effect');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.concept_folders', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.concept_folders (project_id, name, position)
     values (tests.project_a(), 'anon', 'G') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.concept_folders set name = 'anon' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.concept_folders', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
