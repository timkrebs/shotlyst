-- RLS on public.concepts: every project role reads, only editors (and
-- workspace admins) write. Each project starts with one seeded concept
-- called "Treatment".

begin;

select plan(36);

select tests.setup_workspace();
insert into public.concept_folders (id, project_id, name, position) values
  ('cf000000-0000-4000-8000-000000000001', tests.project_a(), 'Drafts A', 'G');
insert into public.concepts (id, project_id, folder_id, title, type) values
  ('cc000000-0000-4000-8000-000000000001', tests.project_a(),
   'cf000000-0000-4000-8000-000000000001', 'Brief A', 'brief'),
  ('cc000000-0000-4000-8000-000000000002', tests.project_a(), null, 'Note A', 'note'),
  ('cc000000-0000-4000-8000-000000000003', tests.project_b(), null, 'Brief B', 'brief');

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select title from public.concepts order by title',
  array['Brief A', 'Note A', 'Treatment'], 'editor sees the concepts of project A');
select tests.authenticate_as('commenter@tests.local');
select results_eq(
  'select title from public.concepts order by title',
  array['Brief A', 'Note A', 'Treatment'], 'commenter sees the concepts of project A');
select tests.authenticate_as('viewer@tests.local');
select results_eq(
  'select title from public.concepts order by title',
  array['Brief A', 'Note A', 'Treatment'], 'viewer sees the concepts of project A');
select tests.authenticate_as('outsider@tests.local');
select results_eq(
  'select title from public.concepts order by title',
  array['Brief B', 'Treatment'], 'outsider sees project B only');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.concepts), 5::bigint, 'admin sees every concept');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.concepts', 'deactivated member sees no concepts');
select tests.authenticate_as('stranger@tests.local');
select is_empty('select id from public.concepts', 'user without a profile sees no concepts');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.concepts (project_id, folder_id, title)
     values (tests.project_a(), 'cf000000-0000-4000-8000-000000000001', 'New A') $$,
  'editor adds a concept to project A');
select results_eq(
  $$ select type, status, is_active, created_by from public.concepts where title = 'New A' $$,
  $$ values ('treatment', 'draft', false, tests.uid('editor')) $$,
  'a new concept is an inactive draft treatment created by the caller');
select throws_ok(
  $$ insert into public.concepts (project_id, title) values (tests.project_b(), 'X') $$,
  '42501', null, 'editor of project A cannot add a concept to project B');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into public.concepts (project_id, title) values (tests.project_a(), 'X') $$,
  '42501', null, 'commenter cannot add a concept');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.concepts (project_id, title) values (tests.project_a(), 'X') $$,
  '42501', null, 'viewer cannot add a concept');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.concepts (project_id, title) values (tests.project_a(), 'X') $$,
  '42501', null, 'outsider cannot add a concept to project A');
select lives_ok(
  $$ insert into public.concepts (project_id, title) values (tests.project_b(), 'New B') $$,
  'outsider adds a concept to project B');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.concepts (project_id, title) values (tests.project_b(), 'Admin B') $$,
  'admin adds a concept without being a project member');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.concepts (project_id, title) values (tests.project_a(), 'X') $$,
  '42501', null, 'deactivated editor cannot add a concept');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.concepts
     set title = 'Brief A final', status = 'final', content = '{"type": "doc", "content": []}'
     where id = 'cc000000-0000-4000-8000-000000000001' returning id $$,
  'editor updates a concept of project A');
select throws_ok(
  $$ update public.concepts set project_id = tests.project_b(), folder_id = null
     where id = 'cc000000-0000-4000-8000-000000000002' $$,
  '23514', 'a row cannot move to another project', 'editor cannot move a concept into project B');
select is_empty(
  $$ update public.concepts set title = 'hacked'
     where id = 'cc000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot update a concept of project B');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.concepts set title = 'hacked' returning id $$,
  'commenter cannot update concepts');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.concepts set title = 'hacked' returning id $$,
  'viewer cannot update concepts');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.concepts set title = 'hacked'
     where project_id = tests.project_a() returning id $$,
  'outsider cannot update concepts of project A');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.concepts set title = 'Brief B final'
     where id = 'cc000000-0000-4000-8000-000000000003' returning id $$,
  'admin updates a concept of project B');

select tests.reset_role();
select results_eq(
  $$ select title from public.concepts where id::text like 'cc000000-%' order by id $$,
  array['Brief A final', 'Note A', 'Brief B final'],
  'only the allowed updates were stored');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty('delete from public.concepts returning id', 'viewer cannot delete concepts');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  'delete from public.concepts returning id', 'commenter cannot delete concepts');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.concepts where project_id = tests.project_a() returning id $$,
  'outsider cannot delete concepts of project A');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ delete from public.concepts
     where id = 'cc000000-0000-4000-8000-000000000002' returning id $$,
  'editor deletes a concept of project A');
select is_empty(
  $$ delete from public.concepts
     where id = 'cc000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot delete a concept of project B');
select isnt_empty(
  $$ delete from public.concept_folders
     where id = 'cf000000-0000-4000-8000-000000000001' returning id $$,
  'editor deletes a folder that still holds concepts');

select tests.reset_role();
select results_eq(
  $$ select id, folder_id from public.concepts where id::text like 'cc000000-%' order by id $$,
  $$ values ('cc000000-0000-4000-8000-000000000001'::uuid, null::uuid),
            ('cc000000-0000-4000-8000-000000000003'::uuid, null::uuid) $$,
  'only the allowed delete took effect; the concept outlives its folder');
select is(
  (select count(*) from public.concepts where title = 'Treatment'), 2::bigint,
  'the seeded concepts are untouched');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.concepts', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.concepts (project_id, title) values (tests.project_a(), 'anon') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.concepts set title = 'anon' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.concepts', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
