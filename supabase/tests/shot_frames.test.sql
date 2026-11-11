-- RLS on public.shot_frames (storyboard images of a shot): every project role
-- reads, only editors (and workspace admins) write. project_id comes from the
-- shot; the file must belong to the same project.

begin;

select plan(35);

select tests.setup_workspace();
insert into public.files (id, project_id, path, name, mime, size) values
  ('f0000000-0000-4000-8000-000000000001', tests.project_a(),
   tests.project_a() || '/files/a1.png', 'a1.png', 'image/png', 1),
  ('f0000000-0000-4000-8000-000000000002', tests.project_a(),
   tests.project_a() || '/files/a2.png', 'a2.png', 'image/png', 1),
  ('f0000000-0000-4000-8000-000000000003', tests.project_b(),
   tests.project_b() || '/files/b1.png', 'b1.png', 'image/png', 1);
insert into public.shots (id, segment_id, position) values
  ('50000000-0000-4000-8000-000000000001', tests.segment_id(tests.project_a()), 'G'),
  ('50000000-0000-4000-8000-000000000003', tests.segment_id(tests.project_b()), 'G');
insert into public.shot_frames (id, shot_id, file_id) values
  ('fa000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001',
   'f0000000-0000-4000-8000-000000000001'),
  ('fa000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000003',
   'f0000000-0000-4000-8000-000000000003');

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select id from public.shot_frames',
  array['fa000000-0000-4000-8000-000000000001'::uuid], 'editor sees the frames of project A');
select tests.authenticate_as('commenter@tests.local');
select results_eq(
  'select id from public.shot_frames',
  array['fa000000-0000-4000-8000-000000000001'::uuid],
  'commenter sees the frames of project A');
select tests.authenticate_as('viewer@tests.local');
select results_eq(
  'select id from public.shot_frames',
  array['fa000000-0000-4000-8000-000000000001'::uuid], 'viewer sees the frames of project A');
select tests.authenticate_as('outsider@tests.local');
select results_eq(
  'select id from public.shot_frames',
  array['fa000000-0000-4000-8000-000000000002'::uuid], 'outsider sees project B only');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.shot_frames), 2::bigint, 'admin sees every frame');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.shot_frames', 'deactivated member sees no frames');
select tests.authenticate_as('stranger@tests.local');
select is_empty('select id from public.shot_frames', 'user without a profile sees no frames');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.shot_frames (id, shot_id, file_id, source, prompt)
     values ('fa000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-000000000001',
             'f0000000-0000-4000-8000-000000000002', 'reference', 'Low sun, long shadows') $$,
  'editor adds a frame to a shot of project A');
select results_eq(
  $$ select project_id, created_by from public.shot_frames
     where id = 'fa000000-0000-4000-8000-00000000000a' $$,
  $$ values (tests.project_a(), tests.uid('editor')) $$,
  'the frame takes its project from the shot and its creator from the caller');
select throws_ok(
  $$ insert into public.shot_frames (shot_id, file_id)
     values ('50000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000003') $$,
  '42501', null, 'editor of project A cannot add a frame to a shot of project B');
select throws_ok(
  $$ insert into public.shot_frames (shot_id, file_id, source)
     values ('50000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002',
             'scan') $$,
  '23514', null, 'a frame needs a known source');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into public.shot_frames (shot_id, file_id)
     values ('50000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'commenter cannot add a frame');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.shot_frames (shot_id, file_id)
     values ('50000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'viewer cannot add a frame');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.shot_frames (shot_id, file_id)
     values ('50000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'outsider cannot add a frame to a shot of project A');
select lives_ok(
  $$ insert into public.shot_frames (shot_id, file_id)
     values ('50000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000003') $$,
  'outsider adds a frame to a shot of project B');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.shot_frames (shot_id, file_id)
     values ('50000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000003') $$,
  'admin adds a frame without being a project member');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.shot_frames (shot_id, file_id)
     values ('50000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'deactivated editor cannot add a frame');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.shot_frames set prompt = 'Edited', file_id = 'f0000000-0000-4000-8000-000000000002'
     where id = 'fa000000-0000-4000-8000-000000000001' returning id $$,
  'editor updates a frame of project A');
select isnt_empty(
  $$ update public.shots set active_frame_id = 'fa000000-0000-4000-8000-000000000001'
     where id = '50000000-0000-4000-8000-000000000001' returning id $$,
  'editor makes a frame the active one of its shot');
select is_empty(
  $$ update public.shot_frames set prompt = 'hacked'
     where id = 'fa000000-0000-4000-8000-000000000002' returning id $$,
  'editor of project A cannot update a frame of project B');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.shot_frames set prompt = 'hacked' returning id $$,
  'commenter cannot update frames');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.shot_frames set prompt = 'hacked' returning id $$,
  'viewer cannot update frames');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.shot_frames set prompt = 'hacked'
     where project_id = tests.project_a() returning id $$,
  'outsider cannot update frames of project A');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.shot_frames set prompt = 'Edited by admin'
     where id = 'fa000000-0000-4000-8000-000000000002' returning id $$,
  'admin updates a frame of project B');

select tests.reset_role();
select results_eq(
  $$ select prompt, project_id from public.shot_frames
     where id in ('fa000000-0000-4000-8000-000000000001',
                  'fa000000-0000-4000-8000-000000000002') order by id $$,
  $$ values ('Edited', tests.project_a()), ('Edited by admin', tests.project_b()) $$,
  'only the allowed updates were stored');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty('delete from public.shot_frames returning id', 'viewer cannot delete frames');
select tests.authenticate_as('commenter@tests.local');
select is_empty('delete from public.shot_frames returning id', 'commenter cannot delete frames');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.shot_frames where project_id = tests.project_a() returning id $$,
  'outsider cannot delete frames of project A');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ delete from public.shot_frames
     where id = 'fa000000-0000-4000-8000-000000000001' returning id $$,
  'editor deletes the active frame of a shot of project A');
select is_empty(
  $$ delete from public.shot_frames
     where id = 'fa000000-0000-4000-8000-000000000002' returning id $$,
  'editor of project A cannot delete a frame of project B');

select tests.reset_role();
select results_eq(
  $$ select project_id, count(*) from public.shot_frames
     group by project_id order by project_id $$,
  $$ values (tests.project_a(), 1::bigint), (tests.project_b(), 3::bigint) $$,
  'only the allowed delete took effect');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.shot_frames', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.shot_frames (shot_id, file_id)
     values ('50000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.shot_frames set prompt = 'anon' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.shot_frames', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
