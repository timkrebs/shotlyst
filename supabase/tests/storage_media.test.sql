-- Policies on storage.objects for the private `media` bucket. The first path
-- segment decides: a project ID follows the project roles, `library` is open
-- to every member, anything else is closed to everyone.
-- All test objects live under `rls-test/` so other local objects do not count.

begin;

select plan(42);

select tests.setup_workspace();
-- storage.objects rejects direct deletes unless this is set.
select set_config('storage.allow_delete_query', 'true', true);

insert into storage.buckets (id, name, public) values ('rls-test-other', 'rls-test-other', false);
insert into storage.objects (bucket_id, name, owner_id) values
  ('media', tests.project_a() || '/rls-test/a.png', tests.uid('editor')::text),
  ('media', tests.project_b() || '/rls-test/b.png', tests.uid('outsider')::text),
  ('media', 'library/rls-test/viewer.png', tests.uid('viewer')::text),
  ('media', 'library/rls-test/owner.png', tests.uid('owner')::text),
  ('media', 'misc/rls-test/stray.png', tests.uid('owner')::text),
  ('rls-test-other', tests.project_a() || '/rls-test/other.png', tests.uid('editor')::text);

create function pg_temp.visible() returns setof text
language sql stable as $$
  select split_part(name, '/', 1) || '/' || split_part(name, '/', 3)
  from storage.objects where name like '%/rls-test/%' order by name collate "C";
$$;

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select pg_temp.visible()',
  array[tests.project_a() || '/a.png', 'library/owner.png', 'library/viewer.png'],
  'editor sees project A and library objects');
select tests.authenticate_as('viewer@tests.local');
select results_eq(
  'select pg_temp.visible()',
  array[tests.project_a() || '/a.png', 'library/owner.png', 'library/viewer.png'],
  'viewer sees project A and library objects');
select tests.authenticate_as('outsider@tests.local');
select results_eq(
  'select pg_temp.visible()',
  array[tests.project_b() || '/b.png', 'library/owner.png', 'library/viewer.png'],
  'outsider sees project B and library objects, not project A');
select tests.authenticate_as('admin@tests.local');
select results_eq(
  'select pg_temp.visible()',
  array[tests.project_a() || '/a.png', tests.project_b() || '/b.png',
        'library/owner.png', 'library/viewer.png'],
  'admin sees project and library objects, but no stray path and no other bucket');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select pg_temp.visible()', 'deactivated member sees no objects');
select tests.authenticate_as('stranger@tests.local');
select is_empty('select pg_temp.visible()', 'user without a profile sees no objects');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('media', tests.project_a() || '/rls-test/new.png', auth.uid()::text) $$,
  'editor uploads into project A');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('media', tests.project_b() || '/rls-test/x.png', auth.uid()::text) $$,
  '42501', null, 'editor of project A cannot upload into project B');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('rls-test-other', tests.project_a() || '/rls-test/x.png', auth.uid()::text) $$,
  '42501', null, 'editor cannot upload into another bucket');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('media', tests.project_a() || '/rls-test/c.png', auth.uid()::text) $$,
  '42501', null, 'commenter cannot upload into project A');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('media', tests.project_a() || '/rls-test/v.png', auth.uid()::text) $$,
  '42501', null, 'viewer cannot upload into project A');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('media', 'library/rls-test/viewer-2.png', auth.uid()::text) $$,
  'viewer uploads into the library');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('media', tests.project_a() || '/rls-test/o.png', auth.uid()::text) $$,
  '42501', null, 'outsider cannot upload into project A');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('media', tests.project_b() || '/rls-test/o.png', auth.uid()::text) $$,
  'outsider uploads into project B');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('media', 'library/rls-test/d.png', auth.uid()::text) $$,
  '42501', null, 'deactivated member cannot upload into the library');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('media', tests.project_a() || '/rls-test/d.png', auth.uid()::text) $$,
  '42501', null, 'deactivated editor cannot upload into project A');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('media', tests.project_b() || '/rls-test/admin.png', auth.uid()::text) $$,
  'admin uploads into a project without being a member');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('media', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd/rls-test/admin.png', auth.uid()::text) $$,
  '42501', null, 'admin cannot upload under the ID of a project that does not exist');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('media', 'misc/rls-test/admin.png', auth.uid()::text) $$,
  '42501', null, 'admin cannot upload under a path that is neither a project nor library');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('media', 'rls-test-root.png', auth.uid()::text) $$,
  '42501', null, 'admin cannot upload to the bucket root');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('media', upper(tests.project_a()::text) || '/rls-test/x.png',
             auth.uid()::text) $$,
  '42501', null, 'admin cannot upload under a project ID in upper case');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update storage.objects set name = tests.project_a() || '/rls-test/a-renamed.png'
     where name = tests.project_a() || '/rls-test/a.png' returning id $$,
  'editor renames an object of project A');
select is_empty(
  $$ update storage.objects set user_metadata = '{"x":1}'
     where name = 'library/rls-test/viewer.png' returning id $$,
  'editor cannot update a library object of someone else');
select throws_ok(
  $$ update storage.objects set name = tests.project_b() || '/rls-test/moved.png'
     where name = tests.project_a() || '/rls-test/a-renamed.png' $$,
  '42501', null, 'editor cannot move an object into project B');
select throws_ok(
  $$ update storage.objects set name = 'misc/rls-test/moved.png'
     where name = tests.project_a() || '/rls-test/a-renamed.png' $$,
  '42501', null, 'editor cannot move an object to a stray path');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update storage.objects set user_metadata = '{"x":1}'
     where name like tests.project_a() || '/rls-test/%' returning id $$,
  'viewer cannot update objects of project A');
select isnt_empty(
  $$ update storage.objects set user_metadata = '{"x":1}'
     where name = 'library/rls-test/viewer.png' returning id $$,
  'viewer updates their own library object');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update storage.objects set user_metadata = '{"x":1}'
     where name like tests.project_a() || '/rls-test/%'
        or name = 'library/rls-test/owner.png' returning id $$,
  'outsider cannot update project A objects or library objects of others');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update storage.objects set user_metadata = '{"x":1}'
     where name = 'library/rls-test/owner.png' returning id $$,
  'admin updates a library object of someone else');
select is_empty(
  $$ update storage.objects set user_metadata = '{"x":1}'
     where name = 'misc/rls-test/stray.png' or bucket_id = 'rls-test-other' returning id $$,
  'admin cannot update a stray object or one in another bucket');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ delete from storage.objects where name like tests.project_a() || '/rls-test/%'
     returning id $$,
  'viewer cannot delete objects of project A');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ delete from storage.objects where name like tests.project_a() || '/rls-test/%'
     returning id $$,
  'commenter cannot delete objects of project A');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from storage.objects
     where name like tests.project_a() || '/rls-test/%'
        or name = 'library/rls-test/viewer.png' returning id $$,
  'outsider cannot delete project A objects or library objects of others');
select tests.authenticate_as('editor@tests.local');
select is_empty(
  $$ delete from storage.objects where name = 'library/rls-test/viewer.png' returning id $$,
  'editor cannot delete a library object of someone else');
select isnt_empty(
  $$ delete from storage.objects where name = tests.project_a() || '/rls-test/new.png'
     returning id $$,
  'editor deletes an object of project A');
select tests.authenticate_as('viewer@tests.local');
select isnt_empty(
  $$ delete from storage.objects where name = 'library/rls-test/viewer-2.png' returning id $$,
  'viewer deletes their own library object');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ delete from storage.objects where name = 'library/rls-test/viewer.png' returning id $$,
  'admin deletes a library object of someone else');
select is_empty(
  $$ delete from storage.objects
     where name = 'misc/rls-test/stray.png' or bucket_id = 'rls-test-other' returning id $$,
  'admin cannot delete a stray object or one in another bucket');

select tests.reset_role();
select results_eq(
  $$ select bucket_id || ':' || split_part(name, '/', 1) || '/' || split_part(name, '/', 3)
     from storage.objects where name like '%/rls-test/%'
     order by bucket_id collate "C", name collate "C" $$,
  array[
    'media:' || tests.project_a() || '/a-renamed.png',
    'media:' || tests.project_b() || '/admin.png',
    'media:' || tests.project_b() || '/b.png',
    'media:' || tests.project_b() || '/o.png',
    'media:library/owner.png',
    'media:misc/stray.png',
    'rls-test-other:' || tests.project_a() || '/other.png'
  ],
  'only the allowed changes were stored');

-- anonymous: holds table privileges on storage.objects, so RLS alone decides
select tests.authenticate_anon();
select is_empty('select pg_temp.visible()', 'anon sees no objects');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('media', 'library/rls-test/anon.png') $$,
  '42501', null, 'anon cannot upload');
select is_empty(
  $$ with changed as (
       update storage.objects set user_metadata = '{"x":1}' where name like '%/rls-test/%'
       returning id)
     , removed as (
       delete from storage.objects where name like '%/rls-test/%' returning id)
     select id from changed union all select id from removed $$,
  'anon cannot update or delete objects');

select * from finish();

rollback;
