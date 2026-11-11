-- RLS on public.files: project files follow the project roles; library files
-- (project_id null) are read by every member and changed by their uploader
-- or an admin.

begin;

select plan(40);

select tests.setup_workspace();
insert into public.files (id, project_id, path, name, mime, size, created_by) values
  ('f0000000-0000-4000-8000-000000000001', tests.project_a(),
   tests.project_a() || '/files/a.png', 'a.png', 'image/png', 1, tests.uid('editor')),
  ('f0000000-0000-4000-8000-000000000002', tests.project_b(),
   tests.project_b() || '/files/b.png', 'b.png', 'image/png', 1, tests.uid('outsider')),
  ('f0000000-0000-4000-8000-000000000003', null,
   'library/avatars/viewer.png', 'viewer.png', 'image/png', 1, tests.uid('viewer')),
  ('f0000000-0000-4000-8000-000000000004', null,
   'library/avatars/owner.png', 'owner.png', 'image/png', 1, tests.uid('owner'));

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select name from public.files order by name',
  array['a.png', 'owner.png', 'viewer.png'],
  'editor sees project A and library files');
select tests.authenticate_as('viewer@tests.local');
select results_eq(
  'select name from public.files order by name',
  array['a.png', 'owner.png', 'viewer.png'],
  'viewer sees project A and library files');
select tests.authenticate_as('outsider@tests.local');
select results_eq(
  'select name from public.files order by name',
  array['b.png', 'owner.png', 'viewer.png'],
  'outsider sees project B and library files, not project A');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.files), 4::bigint, 'admin sees every file');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.files', 'deactivated member sees no files');
select tests.authenticate_as('stranger@tests.local');
select is_empty('select id from public.files', 'user without a profile sees no files');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.files (project_id, path, name, mime, size)
     values (tests.project_a(), tests.project_a() || '/files/new.png', 'new.png',
             'image/png', 1) $$,
  'editor adds a file to project A');
select throws_ok(
  $$ insert into public.files (project_id, path, name, mime, size)
     values (tests.project_b(), tests.project_b() || '/files/x.png', 'x.png',
             'image/png', 1) $$,
  '42501', null, 'editor of project A cannot add a file to project B');
select throws_ok(
  $$ insert into public.files (project_id, path, name, mime, size, created_by)
     values (tests.project_a(), tests.project_a() || '/files/forged.png', 'forged.png',
             'image/png', 1, tests.uid('owner')) $$,
  '42501', null, 'editor cannot add a file in another name');
select throws_ok(
  $$ insert into public.files (project_id, path, name, mime, size)
     values (tests.project_a(), 'library/x.png', 'x.png', 'image/png', 1) $$,
  '23514', null, 'a project file must live under its project path');
select lives_ok(
  $$ insert into public.files (path, name, mime, size)
     values ('library/avatars/editor.png', 'editor.png', 'image/png', 1) $$,
  'editor adds a library file');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into public.files (project_id, path, name, mime, size)
     values (tests.project_a(), tests.project_a() || '/files/c.png', 'c.png',
             'image/png', 1) $$,
  '42501', null, 'commenter cannot add a file to project A');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.files (project_id, path, name, mime, size)
     values (tests.project_a(), tests.project_a() || '/files/v.png', 'v.png',
             'image/png', 1) $$,
  '42501', null, 'viewer cannot add a file to project A');
select lives_ok(
  $$ insert into public.files (path, name, mime, size)
     values ('library/avatars/viewer-2.png', 'viewer-2.png', 'image/png', 1) $$,
  'viewer adds a library file');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.files (project_id, path, name, mime, size)
     values (tests.project_a(), tests.project_a() || '/files/o.png', 'o.png',
             'image/png', 1) $$,
  '42501', null, 'outsider cannot add a file to project A');
select lives_ok(
  $$ insert into public.files (project_id, path, name, mime, size)
     values (tests.project_b(), tests.project_b() || '/files/o.png', 'o.png',
             'image/png', 1) $$,
  'outsider adds a file to project B');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.files (path, name, mime, size)
     values ('library/avatars/d.png', 'd.png', 'image/png', 1) $$,
  '42501', null, 'deactivated member cannot add a library file');
select throws_ok(
  $$ insert into public.files (project_id, path, name, mime, size)
     values (tests.project_a(), tests.project_a() || '/files/d.png', 'd.png',
             'image/png', 1) $$,
  '42501', null, 'deactivated editor cannot add a file to project A');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.files set name = 'a-renamed.png'
     where id = 'f0000000-0000-4000-8000-000000000001' returning id $$,
  'editor updates a file of project A');
select is_empty(
  $$ update public.files set name = 'hacked.png'
     where id = 'f0000000-0000-4000-8000-000000000003' returning id $$,
  'editor cannot update a library file of someone else');
select throws_ok(
  $$ update public.files
     set project_id = tests.project_b(), path = tests.project_b() || '/files/moved.png'
     where id = 'f0000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'editor cannot move a file into project B');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.files set name = 'hacked.png'
     where id = 'f0000000-0000-4000-8000-000000000001' returning id $$,
  'commenter cannot update a file of project A');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.files set name = 'hacked.png'
     where id = 'f0000000-0000-4000-8000-000000000001' returning id $$,
  'viewer cannot update a file of project A');
select isnt_empty(
  $$ update public.files set name = 'viewer-renamed.png'
     where id = 'f0000000-0000-4000-8000-000000000003' returning id $$,
  'viewer updates their own library file');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.files set name = 'hacked.png'
     where id in ('f0000000-0000-4000-8000-000000000001',
                  'f0000000-0000-4000-8000-000000000003') returning id $$,
  'outsider cannot update project A files or library files of others');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.files set name = 'owner-renamed.png'
     where id = 'f0000000-0000-4000-8000-000000000004' returning id $$,
  'admin updates a library file of someone else');

select tests.reset_role();
select results_eq(
  $$ select name from public.files where id::text like 'f0000000-%' order by id $$,
  array['a-renamed.png', 'b.png', 'viewer-renamed.png', 'owner-renamed.png'],
  'only the allowed updates were stored');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ delete from public.files where project_id = tests.project_a() returning id $$,
  'viewer cannot delete files of project A');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ delete from public.files where project_id = tests.project_a() returning id $$,
  'commenter cannot delete files of project A');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.files where project_id = tests.project_a() returning id $$,
  'outsider cannot delete files of project A');
select is_empty(
  $$ delete from public.files where id = 'f0000000-0000-4000-8000-000000000003'
     returning id $$,
  'outsider cannot delete a library file of someone else');
select tests.authenticate_as('editor@tests.local');
select is_empty(
  $$ delete from public.files where id = 'f0000000-0000-4000-8000-000000000003'
     returning id $$,
  'editor cannot delete a library file of someone else');
select isnt_empty(
  $$ delete from public.files where id = 'f0000000-0000-4000-8000-000000000001'
     returning id $$,
  'editor deletes a file of project A');
select tests.authenticate_as('viewer@tests.local');
select isnt_empty(
  $$ delete from public.files where id = 'f0000000-0000-4000-8000-000000000003'
     returning id $$,
  'viewer deletes their own library file');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ delete from public.files where id = 'f0000000-0000-4000-8000-000000000004'
     returning id $$,
  'admin deletes a library file of someone else');

select tests.reset_role();
select results_eq(
  $$ select id from public.files where id::text like 'f0000000-%' $$,
  array['f0000000-0000-4000-8000-000000000002'::uuid],
  'only the allowed deletes took effect');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.files', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.files (path, name, mime, size)
     values ('library/anon.png', 'anon.png', 'image/png', 1) $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.files set name = 'anon.png' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.files', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
