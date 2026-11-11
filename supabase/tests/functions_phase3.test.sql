-- Phase 3 triggers and RPC functions: project_id from the parent row, the
-- creative of a shot, same-project references, the active frame, talents in
-- use, the defaults of a new project, duplicate_project and the cascade when
-- a project is deleted.

begin;

select plan(104);

select tests.setup_workspace();

-- Project A gets a second creative with its own segment, four shots, frames,
-- cast, a custom column, concepts with beats and open items, and a task board
-- that differs from the defaults. Project B gets one shot with a frame.
insert into public.brands (id, name, created_by) values
  ('d0000000-0000-4000-8000-000000000001', 'Brand', tests.uid('owner'));
update public.projects
set description = 'Source project', aspect_ratio = '9:16', timezone = 'Europe/Berlin',
    kind = 'narrative', brand_id = 'd0000000-0000-4000-8000-000000000001', status = 'production'
where id = tests.project_a();
update public.creatives set goal = 'Sell the blend', aspect_ratio = '1:1', status = 'approved'
where id = tests.creative_id(tests.project_a());
insert into public.creatives (id, project_id, title, position) values
  ('c1000000-0000-4000-8000-000000000001', tests.project_a(), 'Cutdown A', 'k');
update public.segments set target_duration_sec = 10
where id = tests.segment_id(tests.project_a());
insert into public.segments (id, creative_id, title, description, position) values
  ('5e000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
   'Cut A', 'Six seconds', 'G');
insert into public.shots (
  id, segment_id, position, shot_number, action, audio, shot_size, camera_movement, int_ext,
  day_night, duration_sec, setup_min, status, notes, custom_values
) values
  ('50000000-0000-4000-8000-000000000001', tests.segment_id(tests.project_a()), 'G', '1A',
   'Fog over the pier', 'Ferry horn', 'wide', 'static', 'ext', 'dawn', 4, 20, 'shot',
   'Needs the early ferry', '{"vfx": true}'),
  ('50000000-0000-4000-8000-000000000002', tests.segment_id(tests.project_a()), 'V', null,
   'Hands on the drum', 'Roaster hum', 'close_up', 'dolly', 'int', 'day', 3, null, 'ready',
   null, '{}'),
  ('50000000-0000-4000-8000-000000000003', '5e000000-0000-4000-8000-000000000001', 'G', null,
   'Logo', null, 'medium', 'static', null, null, 6, null, 'dropped', null, '{}'),
  ('50000000-0000-4000-8000-000000000004', tests.segment_id(tests.project_b()), 'G', null,
   'Deck at night', null, 'wide', 'pan', 'ext', 'night', 5, null, 'planned', null, '{}');
insert into public.files (id, project_id, path, name, mime, size, created_by) values
  ('f0000000-0000-4000-8000-000000000001', tests.project_a(),
   tests.project_a() || '/files/a.png', 'a.png', 'image/png', 1, tests.uid('editor')),
  ('f0000000-0000-4000-8000-000000000002', tests.project_b(),
   tests.project_b() || '/files/b.png', 'b.png', 'image/png', 1, tests.uid('outsider')),
  ('f0000000-0000-4000-8000-000000000003', null,
   'library/avatars/owner.png', 'owner.png', 'image/png', 1, tests.uid('owner'));
insert into public.shot_frames (id, shot_id, file_id) values
  ('fa000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001',
   'f0000000-0000-4000-8000-000000000001'),
  ('fa000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002',
   'f0000000-0000-4000-8000-000000000001'),
  ('fa000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004',
   'f0000000-0000-4000-8000-000000000002');
insert into public.talents (id, name, type, created_by) values
  ('7a000000-0000-4000-8000-000000000001', 'Lead', 'person', tests.uid('owner')),
  ('7a000000-0000-4000-8000-000000000002', 'Prop', 'object', tests.uid('owner')),
  ('7a000000-0000-4000-8000-000000000003', 'Unused', 'animal', tests.uid('owner'));
insert into public.shot_talents (id, shot_id, talent_id) values
  ('57000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001',
   '7a000000-0000-4000-8000-000000000001'),
  ('57000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001',
   '7a000000-0000-4000-8000-000000000002'),
  ('57000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003',
   '7a000000-0000-4000-8000-000000000001');
insert into public.shotlist_columns (id, project_id, key, label, type, config, position, visible)
values
  ('5c000000-0000-4000-8000-000000000001', tests.project_a(), 'vfx', 'VFX', 'checkbox',
   '{}', 'G', true),
  ('5c000000-0000-4000-8000-000000000002', tests.project_a(), 'lens', 'Lens', 'builtin',
   '{}', 'V', false);
insert into public.concept_folders (id, project_id, name, position) values
  ('cf000000-0000-4000-8000-000000000001', tests.project_a(), 'Drafts A', 'G');
insert into public.concepts (id, project_id, folder_id, title, type, status, summary) values
  ('cc000000-0000-4000-8000-000000000001', tests.project_a(),
   'cf000000-0000-4000-8000-000000000001', 'Brief A', 'brief', 'final', 'Short and dry');
insert into public.concept_beats (id, concept_id, title, start_sec, end_sec, position) values
  ('cb000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000001',
   'Hook A', 0, 5, 'G'),
  ('cb000000-0000-4000-8000-000000000002', 'cc000000-0000-4000-8000-000000000001',
   'Payoff A', 5, 30, 'V');
insert into public.beat_items (id, beat_id, label, done, position) values
  ('b1000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001',
   'Find the pier', true, 'G'),
  ('b1000000-0000-4000-8000-000000000002', 'cb000000-0000-4000-8000-000000000002',
   'Clear the music', false, 'G');
delete from public.task_sections where id = tests.section_id(tests.project_a(), 'Review');
insert into public.task_sections (project_id, name, color, position, is_done) values
  (tests.project_a(), 'Archived', '#111111', 'x', true);
insert into public.tasks (project_id, section_id, title, position) values
  (tests.project_a(), tests.section_id(tests.project_a(), 'Open'), 'Book the ferry', 'G');
insert into public.moodboards (id, project_id, title) values
  ('bd000000-0000-4000-8000-000000000001', tests.project_a(), 'Look A');

-- Everything a project holds in the tables duplicate_project reads, as one
-- hash: equal before and after means the source was not touched.
create function tests.project_fingerprint(p_project_id uuid) returns text
language sql stable set search_path = '' as $$
  select md5(string_agg(t.doc, '|' order by t.doc))
  from (
    select to_jsonb(x)::text as doc from public.projects x where x.id = p_project_id
    union all select to_jsonb(x)::text from public.project_members x where x.project_id = p_project_id
    union all select to_jsonb(x)::text from public.creatives x where x.project_id = p_project_id
    union all select to_jsonb(x)::text from public.segments x where x.project_id = p_project_id
    union all select to_jsonb(x)::text from public.shots x where x.project_id = p_project_id
    union all select to_jsonb(x)::text from public.shot_talents x where x.project_id = p_project_id
    union all select to_jsonb(x)::text from public.shot_frames x where x.project_id = p_project_id
    union all select to_jsonb(x)::text from public.shotlist_columns x where x.project_id = p_project_id
    union all select to_jsonb(x)::text from public.concept_folders x where x.project_id = p_project_id
    union all select to_jsonb(x)::text from public.concepts x where x.project_id = p_project_id
    union all select to_jsonb(x)::text from public.concept_beats x where x.project_id = p_project_id
    union all select to_jsonb(x)::text from public.beat_items x where x.project_id = p_project_id
    union all select to_jsonb(x)::text from public.moodboards x where x.project_id = p_project_id
    union all select to_jsonb(x)::text from public.task_sections x where x.project_id = p_project_id
    union all select to_jsonb(x)::text from public.tasks x where x.project_id = p_project_id
    union all select to_jsonb(x)::text from public.files x where x.project_id = p_project_id
  ) t;
$$;

-- A project by its number, for the copies made below. Volatile, so that it
-- sees a project created earlier in the same statement.
create function tests.project_by_number(p_number text) returns uuid
language sql volatile security definer set search_path = '' as $$
  select p.id from public.projects p where p.project_number = p_number;
$$;

select is(
  (select count(*) from public.segments s
     join public.creatives c on c.id = s.creative_id and c.project_id = s.project_id)
  + (select count(*) from public.shots s
       join public.segments g on g.id = s.segment_id and g.project_id = s.project_id
                              and g.creative_id = s.creative_id)
  + (select count(*) from public.shot_talents t
       join public.shots s on s.id = t.shot_id and s.project_id = t.project_id)
  + (select count(*) from public.shot_frames f
       join public.shots s on s.id = f.shot_id and s.project_id = f.project_id),
  13::bigint,
  'child rows inserted without project_id or creative_id take them from their parent');

-- project_id comes from the parent ------------------------------------------
-- The owner may edit both projects, so RLS is not what decides here.

select tests.authenticate_as('owner@tests.local');
select results_eq(
  $$ insert into public.segments (project_id, creative_id, title, position)
     values (tests.project_b(), 'c1000000-0000-4000-8000-000000000001', 'Forged', 'V')
     returning project_id $$,
  array[tests.project_a()], 'a segment ignores the project_id the caller sends');
select results_eq(
  $$ insert into public.shots (id, project_id, segment_id, position)
     values ('50000000-0000-4000-8000-00000000000a', tests.project_b(),
             '5e000000-0000-4000-8000-000000000001', 'V')
     returning project_id $$,
  array[tests.project_a()], 'a shot ignores the project_id the caller sends');
select results_eq(
  $$ insert into public.shot_talents (project_id, shot_id, talent_id)
     values (tests.project_b(), '50000000-0000-4000-8000-00000000000a',
             '7a000000-0000-4000-8000-000000000002')
     returning project_id $$,
  array[tests.project_a()], 'a cast link ignores the project_id the caller sends');
select results_eq(
  $$ insert into public.shot_frames (id, project_id, shot_id, file_id)
     values ('fa000000-0000-4000-8000-00000000000a', tests.project_b(),
             '50000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-000000000001')
     returning project_id $$,
  array[tests.project_a()], 'a frame ignores the project_id the caller sends');

select results_eq(
  $$ update public.segments set project_id = tests.project_b()
     where id = '5e000000-0000-4000-8000-000000000001' returning project_id $$,
  array[tests.project_a()], 'an update cannot change the project_id of a segment');
select results_eq(
  $$ update public.shots set project_id = tests.project_b()
     where id = '50000000-0000-4000-8000-000000000001' returning project_id $$,
  array[tests.project_a()], 'an update cannot change the project_id of a shot');
select results_eq(
  $$ update public.shot_talents set project_id = tests.project_b()
     where id = '57000000-0000-4000-8000-000000000001' returning project_id $$,
  array[tests.project_a()], 'an update cannot change the project_id of a cast link');
select results_eq(
  $$ update public.shot_frames set project_id = tests.project_b()
     where id = 'fa000000-0000-4000-8000-000000000001' returning project_id $$,
  array[tests.project_a()], 'an update cannot change the project_id of a frame');

select throws_ok(
  $$ insert into public.segments (creative_id, title, position)
     values (gen_random_uuid(), 'Orphan', 'G') $$,
  '23503', 'parent row not found', 'a segment needs an existing creative');
select throws_ok(
  $$ insert into public.shots (segment_id, position) values (gen_random_uuid(), 'G') $$,
  '23503', 'parent row not found', 'a shot needs an existing segment');
select throws_ok(
  $$ insert into public.shot_talents (shot_id, talent_id)
     values (gen_random_uuid(), '7a000000-0000-4000-8000-000000000001') $$,
  '23503', 'parent row not found', 'a cast link needs an existing shot');
select throws_ok(
  $$ insert into public.shot_frames (shot_id, file_id)
     values (gen_random_uuid(), 'f0000000-0000-4000-8000-000000000001') $$,
  '23503', 'parent row not found', 'a frame needs an existing shot');

-- An editor of project A names project A but points at a parent in B.
select tests.authenticate_as('editor@tests.local');
select throws_ok(
  $$ insert into public.segments (project_id, creative_id, title, position)
     values (tests.project_a(), tests.creative_id(tests.project_b()), 'X', 'k') $$,
  '42501', null, 'editor of A cannot attach a segment to a creative of B');
select throws_ok(
  $$ insert into public.shots (project_id, creative_id, segment_id, position, action)
     values (tests.project_a(), tests.creative_id(tests.project_a()),
             tests.segment_id(tests.project_b()), 'k', 'X') $$,
  '42501', null, 'editor of A cannot attach a shot to a segment of B');
select throws_ok(
  $$ insert into public.shot_talents (project_id, shot_id, talent_id)
     values (tests.project_a(), '50000000-0000-4000-8000-000000000004',
             '7a000000-0000-4000-8000-000000000003') $$,
  '42501', null, 'editor of A cannot attach a cast link to a shot of B');
select throws_ok(
  $$ insert into public.shot_frames (project_id, shot_id, file_id)
     values (tests.project_a(), '50000000-0000-4000-8000-000000000004',
             'f0000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'editor of A cannot attach a frame to a shot of B');
select throws_ok(
  $$ update public.shots set segment_id = tests.segment_id(tests.project_b())
     where id = '50000000-0000-4000-8000-000000000002' $$,
  '23514', 'a row cannot move to another project',
  'editor of A cannot move a shot to a segment of B');
select throws_ok(
  $$ update public.shot_talents set shot_id = '50000000-0000-4000-8000-000000000004'
     where id = '57000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'editor of A cannot move a cast link to a shot of B');

select tests.reset_role();
select is_empty(
  $$ select 1 from public.segments where title = 'X'
     union all select 1 from public.shots where action = 'X'
     union all select 1 from public.shot_talents
       where shot_id = '50000000-0000-4000-8000-000000000004'
     union all select 1 from public.shot_frames
       where shot_id = '50000000-0000-4000-8000-000000000004'
         and id <> 'fa000000-0000-4000-8000-000000000004' $$,
  'nothing was attached across projects');

-- A shot's creative is the creative of its segment ---------------------------

select tests.authenticate_as('editor@tests.local');
select results_eq(
  $$ insert into public.shots (id, creative_id, segment_id, position)
     values ('50000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-000000000001',
             tests.segment_id(tests.project_a()), 'k')
     returning creative_id $$,
  array[tests.creative_id(tests.project_a())],
  'a shot ignores the creative_id the caller sends');
select results_eq(
  $$ update public.shots set creative_id = 'c1000000-0000-4000-8000-000000000001'
     where id = '50000000-0000-4000-8000-00000000000b' returning creative_id $$,
  array[tests.creative_id(tests.project_a())],
  'an update cannot change the creative_id of a shot');
select results_eq(
  $$ update public.shots set segment_id = '5e000000-0000-4000-8000-000000000001'
     where id = '50000000-0000-4000-8000-00000000000b' returning creative_id, project_id $$,
  $$ values ('c1000000-0000-4000-8000-000000000001'::uuid, tests.project_a()) $$,
  'a shot moved to a segment of another creative follows that creative');
select results_eq(
  $$ update public.shots set segment_id = tests.segment_id(tests.project_a()),
                             creative_id = 'c1000000-0000-4000-8000-000000000001'
     where id = '50000000-0000-4000-8000-00000000000b' returning creative_id $$,
  array[tests.creative_id(tests.project_a())],
  'a shot moved back follows its segment again, whatever creative the caller names');
select tests.reset_role();
select is_empty(
  $$ select 1 from public.shots s join public.segments g on g.id = s.segment_id
     where g.creative_id <> s.creative_id or g.project_id <> s.project_id $$,
  'every shot carries the creative and the project of its segment');
delete from public.shots where id in (
  '50000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-00000000000b');
delete from public.segments where title = 'Forged';

-- Frames: file of the same project, active frame of the same shot -----------

select tests.authenticate_as('owner@tests.local');
select throws_ok(
  $$ insert into public.shot_frames (shot_id, file_id)
     values ('50000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002') $$,
  '23514', 'file_id belongs to another project', 'a frame rejects a file of another project');
select throws_ok(
  $$ insert into public.shot_frames (shot_id, file_id)
     values ('50000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003') $$,
  '23514', null, 'a frame rejects a library file');
select throws_ok(
  $$ update public.shot_frames set file_id = 'f0000000-0000-4000-8000-000000000002'
     where id = 'fa000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'a frame cannot switch to a file of another project');
select throws_ok(
  $$ insert into public.shot_frames (project_id, shot_id, file_id)
     values (tests.project_b(), '50000000-0000-4000-8000-000000000001',
             'f0000000-0000-4000-8000-000000000002') $$,
  '23514', null,
  'a frame rejects a file of another project when the caller names that project');
select throws_ok(
  $$ update public.shot_frames set shot_id = '50000000-0000-4000-8000-000000000004'
     where id = 'fa000000-0000-4000-8000-000000000002' $$,
  '23514', null, 'a frame cannot move to a shot of another project and keep its file');
select throws_ok(
  $$ update public.shot_frames set shot_id = '50000000-0000-4000-8000-000000000002'
     where id = 'fa000000-0000-4000-8000-000000000001' $$,
  '23514', 'shot_id cannot change',
  'a frame cannot move to another shot, so no shot keeps a foreign active frame');
select throws_ok(
  $$ update public.segments set creative_id = tests.creative_id(tests.project_a())
     where id = '5e000000-0000-4000-8000-000000000001' $$,
  '23514', 'creative_id cannot change',
  'a segment cannot move to another creative and strand its shots');
select throws_ok(
  $$ delete from public.files where id = 'f0000000-0000-4000-8000-000000000001' $$,
  '23503', null, 'a file in use as a frame cannot be deleted');

select tests.authenticate_as('editor@tests.local');
select results_eq(
  $$ update public.shots set active_frame_id = 'fa000000-0000-4000-8000-000000000001'
     where id = '50000000-0000-4000-8000-000000000001' returning active_frame_id $$,
  array['fa000000-0000-4000-8000-000000000001'::uuid],
  'a shot accepts one of its own frames as the active one');
select throws_ok(
  $$ update public.shots set active_frame_id = 'fa000000-0000-4000-8000-000000000002'
     where id = '50000000-0000-4000-8000-000000000001' $$,
  '23514', 'the active frame must belong to the shot',
  'a shot rejects the frame of another shot as its active one');
select throws_ok(
  $$ update public.shots set active_frame_id = 'fa000000-0000-4000-8000-000000000004'
     where id = '50000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'a shot rejects a frame of another project as its active one');
select throws_ok(
  $$ update public.shots set active_frame_id = gen_random_uuid()
     where id = '50000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'a shot rejects an unknown frame as its active one');
select throws_ok(
  $$ insert into public.shots (segment_id, position, active_frame_id)
     values (tests.segment_id(tests.project_a()), 'k', 'fa000000-0000-4000-8000-000000000001') $$,
  '23514', null, 'a new shot cannot start with the frame of another shot');
select isnt_empty(
  $$ update public.shots set action = 'Fog over the pier, wider'
     where id = '50000000-0000-4000-8000-000000000001' returning id $$,
  'a shot with an active frame can still be edited');
select isnt_empty(
  $$ delete from public.shot_frames
     where id = 'fa000000-0000-4000-8000-000000000001' returning id $$,
  'editor deletes the active frame');
select results_eq(
  $$ select active_frame_id, action from public.shots
     where id = '50000000-0000-4000-8000-000000000001' $$,
  $$ values (null::uuid, 'Fog over the pier, wider') $$,
  'deleting the active frame clears active_frame_id and keeps the shot');
select isnt_empty(
  $$ update public.shots set active_frame_id = 'fa000000-0000-4000-8000-000000000002'
     where id = '50000000-0000-4000-8000-000000000002' returning id $$,
  'editor picks the active frame of another shot');

-- A board belongs to a creative of its own project ---------------------------

select tests.authenticate_as('owner@tests.local');
select results_eq(
  $$ update public.moodboards set creative_id = 'c1000000-0000-4000-8000-000000000001'
     where id = 'bd000000-0000-4000-8000-000000000001' returning creative_id $$,
  array['c1000000-0000-4000-8000-000000000001'::uuid],
  'a board accepts a creative of its own project');
select throws_ok(
  $$ update public.moodboards set creative_id = tests.creative_id(tests.project_b())
     where id = 'bd000000-0000-4000-8000-000000000001' $$,
  '23514', 'creative_id belongs to another project',
  'a board rejects a creative of another project');
select throws_ok(
  $$ insert into public.moodboards (project_id, title, creative_id)
     values (tests.project_a(), 'Misfiled', tests.creative_id(tests.project_b())) $$,
  '23514', null, 'a new board rejects a creative of another project');
select lives_ok(
  $$ insert into public.moodboards (project_id, title, creative_id)
     values (tests.project_b(), 'Look B', tests.creative_id(tests.project_b())) $$,
  'a new board accepts a creative of its own project');
select results_eq(
  $$ select creative_id from public.moodboards
     where project_id = tests.project_a() and title = 'Moodboard' $$,
  array[null::uuid], 'the board a project starts with belongs to no creative');

-- Rows that cannot change project ---------------------------------------------

select throws_ok(
  $$ update public.creatives set project_id = tests.project_b()
     where id = 'c1000000-0000-4000-8000-000000000001' $$,
  '23514', 'a row cannot move to another project', 'a creative cannot move to another project');
select throws_ok(
  $$ update public.shotlist_columns set project_id = tests.project_b()
     where id = '5c000000-0000-4000-8000-000000000001' $$,
  '23514', 'a row cannot move to another project',
  'a shot-list column cannot move to another project');

-- Talents in use --------------------------------------------------------------

select tests.authenticate_as('editor@tests.local');
select throws_ok(
  $$ insert into public.shot_talents (shot_id, talent_id)
     values ('50000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000001') $$,
  '23505', null, 'a talent appears once per shot');
select throws_ok(
  $$ update public.shot_talents set talent_id = '7a000000-0000-4000-8000-000000000001'
     where id = '57000000-0000-4000-8000-000000000002' $$,
  '23505', null, 'a cast link cannot be changed into a duplicate');
select throws_ok(
  $$ insert into public.shot_talents (shot_id, talent_id)
     values ('50000000-0000-4000-8000-000000000002', gen_random_uuid()) $$,
  '23503', null, 'a cast link needs an existing talent');
select tests.authenticate_as('admin@tests.local');
select throws_ok(
  $$ delete from public.talents where id = '7a000000-0000-4000-8000-000000000001' $$,
  '23503', null, 'admin cannot delete a talent used by a shot');
select isnt_empty(
  $$ delete from public.talents
     where id = '7a000000-0000-4000-8000-000000000003' returning id $$,
  'admin deletes a talent no shot uses');
select tests.reset_role();
select is(
  (select count(*) from public.shot_talents), 3::bigint, 'the cast links are all still there');

-- Defaults of a new project --------------------------------------------------

select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.projects (id, name, project_number, created_by)
     values ('c0000000-0000-4000-8000-00000000000c', 'Project C', 'T-003',
             tests.uid('editor')) $$,
  'a member creates a project');
select results_eq(
  $$ select title, status, aspect_ratio, created_by from public.creatives
     where project_id = 'c0000000-0000-4000-8000-00000000000c' $$,
  $$ values ('Main film', 'draft', null::text, tests.uid('editor')) $$,
  'the new project has exactly one creative');
select results_eq(
  $$ select s.title, c.title, s.created_by from public.segments s
     join public.creatives c on c.id = s.creative_id
     where s.project_id = 'c0000000-0000-4000-8000-00000000000c' $$,
  $$ values ('Segment 1', 'Main film', tests.uid('editor')) $$,
  'the new project has exactly one segment, in that creative');
select results_eq(
  $$ select (select count(*) from public.concepts
             where project_id = 'c0000000-0000-4000-8000-00000000000c' and is_active),
            (select count(*) from public.concepts
             where project_id = 'c0000000-0000-4000-8000-00000000000c'),
            (select count(*) from public.moodboards
             where project_id = 'c0000000-0000-4000-8000-00000000000c'),
            (select count(*) from public.task_sections
             where project_id = 'c0000000-0000-4000-8000-00000000000c') $$,
  $$ values (1::bigint, 1::bigint, 1::bigint, 4::bigint) $$,
  'the phase 2 defaults are intact: one active concept, one board, four columns');
select is_empty(
  $$ select 1 from public.shots where project_id = 'c0000000-0000-4000-8000-00000000000c'
     union all
     select 1 from public.shotlist_columns
       where project_id = 'c0000000-0000-4000-8000-00000000000c' $$,
  'the new project starts without shots or custom columns');
select tests.reset_role();
select is(
  (select count(*) from information_schema.columns
   where table_schema = 'public' and column_name = 'position' and collation_name = 'C'
     and table_name in ('creatives', 'segments', 'shots', 'shotlist_columns')),
  4::bigint, 'every position column sorts bytewise');

-- duplicate_project ------------------------------------------------------------

select set_config('tests.source_before', tests.project_fingerprint(tests.project_a()), true);

select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ select public.duplicate_project(tests.project_a(), 'Stolen', 'T-900') $$,
  '42501', 'project not found', 'outsider cannot duplicate project A');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ select public.duplicate_project(tests.project_a(), 'Stolen', 'T-900') $$,
  '42501', null, 'deactivated editor cannot duplicate project A');
select tests.authenticate_as('stranger@tests.local');
select throws_ok(
  $$ select public.duplicate_project(tests.project_a(), 'Stolen', 'T-900') $$,
  '42501', null, 'user without a profile cannot duplicate a project');
select tests.authenticate_anon();
select throws_ok(
  $$ select public.duplicate_project(tests.project_a(), 'Stolen', 'T-900') $$,
  '42501', null, 'anon cannot call duplicate_project');
select tests.authenticate_as('editor@tests.local');
select throws_ok(
  $$ select public.duplicate_project(tests.project_b(), 'Stolen', 'T-900') $$,
  '42501', null, 'editor of A cannot duplicate project B');
select throws_ok(
  $$ select public.duplicate_project(gen_random_uuid(), 'Ghost', 'T-900') $$,
  '42501', 'project not found', 'an unknown project is reported like a forbidden one');
select throws_ok(
  $$ select public.duplicate_project(tests.project_a(), 'Clash', 'T-002') $$,
  '23505', null, 'a copy cannot take a project number that is in use');
select tests.reset_role();
select is(
  (select count(*) from public.projects), 3::bigint, 'the denied calls created no project');

select tests.authenticate_as('editor@tests.local');
select is(
  (select public.duplicate_project(tests.project_a(), 'Copy of A', 'T-100')),
  tests.project_by_number('T-100'),
  'editor duplicates project A and gets the id of the new project');
select results_eq(
  $$ select name, project_number from public.projects
     where id = tests.project_by_number('T-100') $$,
  $$ values ('Copy of A', 'T-100') $$, 'the caller can read the copy');

select tests.reset_role();
select isnt(
  tests.project_by_number('T-100'), tests.project_a(), 'the copy is a project of its own');
select results_eq(
  $$ select user_id, role::text from public.project_members
     where project_id = tests.project_by_number('T-100') $$,
  $$ values (tests.uid('editor'), 'editor') $$,
  'the caller is the only member of the copy, as editor');
select results_eq(
  $$ select kind::text, description, brand_id, client_id, aspect_ratio, timezone, created_by,
            status
     from public.projects where id = tests.project_by_number('T-100') $$,
  $$ select kind::text, description, brand_id, client_id, aspect_ratio, timezone,
            tests.uid('editor'), 'planning'
     from public.projects where id = tests.project_a() $$,
  'the copy takes the project details and starts in planning');
select results_eq(
  $$ select title, status, goal, aspect_ratio, position::text, created_by from public.creatives
     where project_id = tests.project_by_number('T-100') order by position $$,
  $$ select title, 'draft', goal, aspect_ratio, position::text, tests.uid('editor')
     from public.creatives where project_id = tests.project_a() order by position $$,
  'the copy has the creatives of the source and nothing else, as drafts');
select results_eq(
  $$ select c.title, s.title, s.description, s.target_duration_sec, s.position::text
     from public.segments s join public.creatives c on c.id = s.creative_id
     where s.project_id = tests.project_by_number('T-100')
       and c.project_id = tests.project_by_number('T-100')
     order by c.position, s.position $$,
  $$ select c.title, s.title, s.description, s.target_duration_sec, s.position::text
     from public.segments s join public.creatives c on c.id = s.creative_id
     where s.project_id = tests.project_a() order by c.position, s.position $$,
  'the copy has the segments of the source in the copied creatives');
select results_eq(
  $$ select c.title, g.title, s.position::text, s.shot_number, s.action, s.audio, s.shot_size,
            s.camera_movement, s.int_ext, s.day_night, s.duration_sec, s.setup_min, s.notes,
            s.custom_values::text, s.status, s.active_frame_id, s.created_by
     from public.shots s
     join public.segments g on g.id = s.segment_id and g.project_id = s.project_id
     join public.creatives c on c.id = s.creative_id and c.id = g.creative_id
     where s.project_id = tests.project_by_number('T-100')
     order by c.position, g.position, s.position $$,
  $$ select c.title, g.title, s.position::text, s.shot_number, s.action, s.audio, s.shot_size,
            s.camera_movement, s.int_ext, s.day_night, s.duration_sec, s.setup_min, s.notes,
            s.custom_values::text, 'planned', null::uuid, tests.uid('editor')
     from public.shots s
     join public.segments g on g.id = s.segment_id
     join public.creatives c on c.id = s.creative_id
     where s.project_id = tests.project_a()
     order by c.position, g.position, s.position $$,
  'the copy has the shots in the same order, planned again and without an active frame');
select is(
  (select count(*) from public.shots where project_id = tests.project_by_number('T-100')),
  3::bigint, 'all three shots were copied');
select results_eq(
  $$ select s.action, t.talent_id from public.shot_talents t
     join public.shots s on s.id = t.shot_id and s.project_id = t.project_id
     where t.project_id = tests.project_by_number('T-100') order by 1, 2 $$,
  $$ select s.action, t.talent_id from public.shot_talents t
     join public.shots s on s.id = t.shot_id
     where t.project_id = tests.project_a() order by 1, 2 $$,
  'the copy has the cast of every shot');
select results_eq(
  $$ select key, label, type, config::text, position::text, visible
     from public.shotlist_columns
     where project_id = tests.project_by_number('T-100') order by position $$,
  $$ select key, label, type, config::text, position::text, visible
     from public.shotlist_columns where project_id = tests.project_a() order by position $$,
  'the copy has the shot-list columns');
select results_eq(
  $$ select name, position::text from public.concept_folders
     where project_id = tests.project_by_number('T-100') order by position $$,
  $$ select name, position::text from public.concept_folders
     where project_id = tests.project_a() order by position $$,
  'the copy has the concept folders');
select results_eq(
  $$ select c.title, c.type, c.status, c.is_active, c.content::text, c.summary, f.name
     from public.concepts c
     left join public.concept_folders f on f.id = c.folder_id and f.project_id = c.project_id
     where c.project_id = tests.project_by_number('T-100') order by c.title $$,
  $$ select c.title, c.type, 'draft', c.is_active, c.content::text, c.summary, f.name
     from public.concepts c left join public.concept_folders f on f.id = c.folder_id
     where c.project_id = tests.project_a() order by c.title $$,
  'the copy has the concepts of the source and nothing else, in the copied folders');
select is(
  (select count(*) from public.concepts
   where project_id = tests.project_by_number('T-100') and is_active),
  1::bigint, 'exactly one concept of the copy is active');
select results_eq(
  $$ select c.title, b.title, b.description, b.start_sec, b.end_sec, b.position::text
     from public.concept_beats b
     join public.concepts c on c.id = b.concept_id and c.project_id = b.project_id
     where b.project_id = tests.project_by_number('T-100') order by b.position $$,
  $$ select c.title, b.title, b.description, b.start_sec, b.end_sec, b.position::text
     from public.concept_beats b join public.concepts c on c.id = b.concept_id
     where b.project_id = tests.project_a() order by b.position $$,
  'the copy has the beats in the copied concepts');
select results_eq(
  $$ select b.title, i.label, i.done, i.position::text
     from public.beat_items i
     join public.concept_beats b on b.id = i.beat_id and b.project_id = i.project_id
     where i.project_id = tests.project_by_number('T-100') order by b.title, i.position $$,
  $$ select b.title, i.label, false, i.position::text
     from public.beat_items i join public.concept_beats b on b.id = i.beat_id
     where i.project_id = tests.project_a() order by b.title, i.position $$,
  'the copy has the open items, none of them done');
select results_eq(
  $$ select name, color, position::text, is_done from public.task_sections
     where project_id = tests.project_by_number('T-100') order by position $$,
  $$ select name, color, position::text, is_done from public.task_sections
     where project_id = tests.project_a() order by position $$,
  'the copy has the task columns of the source and nothing else');
select results_eq(
  $$ select (select count(*) from public.shot_frames
             where project_id = tests.project_by_number('T-100')),
            (select count(*) from public.files
             where project_id = tests.project_by_number('T-100')),
            (select count(*) from public.tasks
             where project_id = tests.project_by_number('T-100')),
            (select count(*) from public.moodboards
             where project_id = tests.project_by_number('T-100') and title <> 'Moodboard') $$,
  $$ values (0::bigint, 0::bigint, 0::bigint, 0::bigint) $$,
  'frames, files, tasks and boards are not copied');
select is(
  tests.project_fingerprint(tests.project_a()), current_setting('tests.source_before'),
  'the source project is untouched');

select tests.authenticate_as('viewer@tests.local');
select lives_ok(
  $$ select public.duplicate_project(tests.project_a(), 'Viewer copy', 'T-101') $$,
  'viewer duplicates project A: reading is enough');
select isnt_empty(
  $$ update public.shots set status = 'ready'
     where project_id = tests.project_by_number('T-101') returning id $$,
  'the viewer is editor of their copy');
select is_empty(
  $$ update public.shots set status = 'ready'
     where project_id = tests.project_a() returning id $$,
  'the viewer is still only a viewer of the source');
select tests.authenticate_as('editor@tests.local');
select is_empty(
  $$ select id from public.projects where id = tests.project_by_number('T-101') $$,
  'the editor of the source cannot see the viewer''s copy');
select lives_ok(
  $$ select public.duplicate_project(tests.project_a(), 'Twice 1', 'T-102'),
            public.duplicate_project(tests.project_a(), 'Twice 2', 'T-103') $$,
  'two copies in one statement work');
select lives_ok(
  $$ select public.duplicate_project(tests.project_by_number('T-100'), 'Copy of copy', 'T-104') $$,
  'a copy can be duplicated in the same transaction');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ select public.duplicate_project(tests.project_b(), 'Admin copy', 'T-105') $$,
  'admin duplicates project B without being a project member');

select tests.reset_role();
select results_eq(
  $$ select p.project_number,
            (select count(*) from public.creatives x where x.project_id = p.id),
            (select count(*) from public.segments x where x.project_id = p.id),
            (select count(*) from public.shots x where x.project_id = p.id),
            (select count(*) from public.shot_talents x where x.project_id = p.id),
            (select count(*) from public.concepts x where x.project_id = p.id),
            (select count(*) from public.task_sections x where x.project_id = p.id)
     from public.projects p where p.project_number between 'T-100' and 'T-105'
     order by p.project_number $$,
  $$ values ('T-100', 2::bigint, 2::bigint, 3::bigint, 3::bigint, 2::bigint, 4::bigint),
            ('T-101', 2::bigint, 2::bigint, 3::bigint, 3::bigint, 2::bigint, 4::bigint),
            ('T-102', 2::bigint, 2::bigint, 3::bigint, 3::bigint, 2::bigint, 4::bigint),
            ('T-103', 2::bigint, 2::bigint, 3::bigint, 3::bigint, 2::bigint, 4::bigint),
            ('T-104', 2::bigint, 2::bigint, 3::bigint, 3::bigint, 2::bigint, 4::bigint),
            ('T-105', 1::bigint, 1::bigint, 1::bigint, 0::bigint, 1::bigint, 4::bigint) $$,
  'every copy holds exactly as many rows as its source');
select is(
  tests.project_fingerprint(tests.project_a()), current_setting('tests.source_before'),
  'the source project is still untouched after six copies');

-- Deleting a project ---------------------------------------------------------

select results_eq(
  $$ select t.name from (values
       ('creatives', (select count(*) from public.creatives where project_id = tests.project_a())),
       ('segments', (select count(*) from public.segments where project_id = tests.project_a())),
       ('shots', (select count(*) from public.shots where project_id = tests.project_a() and active_frame_id is not null)),
       ('shot_talents', (select count(*) from public.shot_talents where project_id = tests.project_a())),
       ('shot_frames', (select count(*) from public.shot_frames where project_id = tests.project_a())),
       ('shotlist_columns', (select count(*) from public.shotlist_columns where project_id = tests.project_a())),
       ('moodboards', (select count(*) from public.moodboards where project_id = tests.project_a() and creative_id is not null))
     ) as t (name, n) where t.n = 0 $$,
  array[]::text[],
  'project A holds rows in all six tables, an active frame and a board of a creative included');
select tests.authenticate_as('owner@tests.local');
select lives_ok(
  $$ delete from public.projects where id = tests.project_a() $$,
  'owner deletes project A and everything in it');
select tests.reset_role();
select is(
  (select count(*) from public.projects where id = tests.project_a())
  + (select count(*) from public.creatives where project_id = tests.project_a())
  + (select count(*) from public.segments where project_id = tests.project_a())
  + (select count(*) from public.shots where project_id = tests.project_a())
  + (select count(*) from public.shot_talents where project_id = tests.project_a())
  + (select count(*) from public.shot_frames where project_id = tests.project_a())
  + (select count(*) from public.shotlist_columns where project_id = tests.project_a())
  + (select count(*) from public.moodboards where project_id = tests.project_a())
  + (select count(*) from public.files where project_id = tests.project_a()),
  0::bigint, 'nothing of project A is left in any of the phase 3 tables');
select results_eq(
  'select name from public.talents order by name', array['Lead', 'Prop'],
  'the talents survive the project');
select results_eq(
  $$ select (select count(*) from public.creatives where project_id = tests.project_b()),
            (select count(*) from public.segments where project_id = tests.project_b()),
            (select count(*) from public.shots where project_id = tests.project_b()),
            (select count(*) from public.shot_frames where project_id = tests.project_b()),
            (select count(*) from public.shots
             where project_id = tests.project_by_number('T-100')) $$,
  $$ values (1::bigint, 1::bigint, 1::bigint, 1::bigint, 3::bigint) $$,
  'project B and the copies are untouched');
select tests.authenticate_as('owner@tests.local');
select lives_ok(
  $$ delete from public.projects where id = tests.project_by_number('T-100') $$,
  'owner deletes a copy, cast links included');
select tests.authenticate_as('admin@tests.local');
select throws_ok(
  $$ delete from public.talents where id = '7a000000-0000-4000-8000-000000000001' $$,
  '23503', null, 'a talent cast in the remaining copies still cannot be deleted');

select * from finish();

rollback;
