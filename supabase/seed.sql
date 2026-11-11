-- Local demo data: one workspace, three users, two projects.
-- Loaded by `supabase db reset`. All users sign in with `shotlyst-demo-1`.

-- Auth users. The token columns must be '' (not null) for GoTrue to read them.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('shotlyst-demo-1', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', ''
from (values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'owner@shotlyst.test'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'editor@shotlyst.test'),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'viewer@shotlyst.test')
) as u (id, email);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.email like '%@shotlyst.test';

insert into public.profiles (id, display_name, color, workspace_role) values
  ('11111111-1111-4111-8111-111111111111', 'Olivia Owner', '#4f46e5', 'owner'),
  ('22222222-2222-4222-8222-222222222222', 'Eddie Editor', '#0d9488', 'member'),
  ('33333333-3333-4333-8333-333333333333', 'Vera Viewer', '#d97706', 'member');

insert into public.app_settings (key, value, created_by) values
  ('default_timezone', '"Europe/Berlin"', '11111111-1111-4111-8111-111111111111');

insert into public.clients (id, name, email, phone, note, created_by) values
  ('44444444-4444-4444-8444-444444444444', 'Harbour Coffee Roasters',
   'hello@harbourcoffee.test', '+49 40 555 0100', 'Prefers calls before noon.',
   '11111111-1111-4111-8111-111111111111');

insert into public.brands (
  id, name, description, industry, tone, target_audience, no_gos, website, created_by
) values
  ('55555555-5555-4555-8555-555555555555', 'Harbour Coffee',
   'Small-batch roastery by the docks.', 'Food and beverage', 'Warm, dry, unhurried',
   'City commuters aged 25 to 45', 'No stock footage, no latte art close-ups',
   'https://harbourcoffee.test', '11111111-1111-4111-8111-111111111111');

-- The add_project_creator trigger makes the owner an editor of both projects.
insert into public.projects (
  id, name, project_number, kind, description, brand_id, client_id, aspect_ratio,
  timezone, budget_cents, status, position, created_by
) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Harbour Spot', '2026-001', 'short_form',
   'Thirty-second spot for the spring blend.', '55555555-5555-4555-8555-555555555555',
   '44444444-4444-4444-8444-444444444444', '9:16', 'Europe/Berlin', 450000, 'planning',
   'a0', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Night Ferry', '2026-002', 'narrative',
   'Short film about the last crossing of the night.', null, null, '2.39:1',
   'Europe/Berlin', null, 'planning', 'a1', '11111111-1111-4111-8111-111111111111');

insert into public.project_members (project_id, user_id, role, added_by) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'editor',
   '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'viewer',
   '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'viewer',
   '11111111-1111-4111-8111-111111111111');

insert into public.activity_log (project_id, actor_id, action, entity_type, entity_id, summary) values
  (null, '11111111-1111-4111-8111-111111111111', 'workspace.claimed', 'profile',
   '11111111-1111-4111-8111-111111111111', 'Olivia Owner set up the workspace'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
   'project.created', 'project', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Created the project Harbour Spot'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
   'member.added', 'project_member', '22222222-2222-4222-8222-222222222222',
   'Added Eddie Editor as Editor'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111',
   'project.created', 'project', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'Created the project Night Ferry');

-- Phase 2 demo data for Harbour Spot. Creating the project already seeded its
-- active concept, its moodboard and the four task columns.
insert into public.concept_beats (
  concept_id, title, description, start_sec, end_sec, position, created_by
)
select c.id, b.title, b.description, b.start_sec, b.end_sec, b.position,
       '11111111-1111-4111-8111-111111111111'
from public.concepts c
cross join (values
  ('Dawn at the docks', 'Fog, cranes, the first ferry horn. No dialogue.', 0, 8, 'G'),
  ('The roast', 'Hands, beans, steam. Cut on the rhythm of the drum.', 8, 22, 'V'),
  ('First sip', 'Commuter on the pier, cup in hand, logo and tagline.', 22, 30, 'k')
) as b (title, description, start_sec, end_sec, position)
where c.project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and c.is_active;

insert into public.beat_items (beat_id, label, done, position, created_by)
select b.id, i.label, i.done, i.position, '22222222-2222-4222-8222-222222222222'
from public.concept_beats b
join (values
  ('Dawn at the docks', 'Ask the port authority about filming before 6 am', false, 'G'),
  ('Dawn at the docks', 'Check the sunrise time for the shoot week', true, 'V'),
  ('The roast', 'Decide between macro lens and probe lens', false, 'G'),
  ('First sip', 'Agree the tagline wording with the client', false, 'G'),
  ('First sip', 'Find a commuter who is not an actor', false, 'V')
) as i (beat, label, done, position) on i.beat = b.title
where b.project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- One task is overdue, one is due today at 18:00 in the workspace timezone;
-- the one in Done is completed by the column trigger.
insert into public.tasks (
  project_id, section_id, assignee_id, title, description, priority, labels, due_at,
  position, created_by
)
select s.project_id, s.id, t.assignee_id, t.title, t.description, t.priority, t.labels,
       t.due_at, t.position, '11111111-1111-4111-8111-111111111111'
from public.task_sections s
join (values
  ('Open', '22222222-2222-4222-8222-222222222222'::uuid, 'Scout the east pier at sunrise',
   'Bring the light meter and note where the cranes block the sun.', 'high',
   array['location'], now() - interval '3 days', 'G'),
  ('Open', null, 'Collect music references', null, 'low',
   array['sound'], null::timestamptz, 'V'),
  ('In progress', '11111111-1111-4111-8111-111111111111'::uuid, 'Send the treatment to the client',
   'Final read-through first.', 'urgent',
   array['client'],
   (date_trunc('day', now() at time zone 'Europe/Berlin') + interval '18 hours')
     at time zone 'Europe/Berlin', 'G'),
  ('Review', '22222222-2222-4222-8222-222222222222'::uuid, 'Shot list for the roast sequence',
   null, 'normal', array['camera'], now() + interval '4 days', 'G'),
  ('Done', '11111111-1111-4111-8111-111111111111'::uuid, 'Confirm the budget with the roastery',
   null, 'normal', array['client'], now() - interval '6 days', 'G')
) as t (section, assignee_id, title, description, priority, labels, due_at, position)
  on t.section = s.name
where s.project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- Phase 3 demo data for Harbour Spot. Creating the project already seeded its
-- creative "Main film" with one segment. "Opening" stays under its target
-- duration (9 of 10 seconds), "The pour" runs over (15 of 12 seconds).
insert into public.talents (
  id, name, type, description, languages, residence, daily_rate_cents, tags, created_by
) values
  ('66666666-6666-4666-8666-666666666666', 'Mara Lindqvist', 'person',
   'Barista at the roastery; calm on camera, steady hands.', array['German', 'Swedish', 'English'],
   'Hamburg', 45000, array['barista', 'lead'], '11111111-1111-4111-8111-111111111111'),
  ('77777777-7777-4777-8777-777777777777', 'Espresso machine', 'object',
   'Two-group lever machine from the roastery bar. Needs 25 minutes to heat up.', '{}',
   null, null, array['prop', 'hero'], '11111111-1111-4111-8111-111111111111');

update public.segments
set title = 'Opening', description = 'The harbour wakes up and the roastery opens.',
    target_duration_sec = 10
where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

insert into public.segments (
  creative_id, title, description, target_duration_sec, position, created_by
)
select c.id, 'The pour', 'From the beans to the first cup on the pier.', 12, 'k',
       '11111111-1111-4111-8111-111111111111'
from public.creatives c
where c.project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

insert into public.shots (
  id, segment_id, position, action, audio, shot_size, camera_movement, camera_angle, lens,
  int_ext, day_night, duration_sec, setup_min, status, custom_values, created_by
)
select t.id, s.id, t.position, t.action, t.audio, t.shot_size, t.camera_movement,
       t.camera_angle, t.lens, t.int_ext, t.day_night, t.duration_sec, t.setup_min, t.status,
       t.custom_values, '22222222-2222-4222-8222-222222222222'
from public.segments s
join (values
  ('dddddddd-0000-4000-8000-000000000001'::uuid, 'Opening', 'G',
   'Fog lifts over the docks; the roastery sign flickers on.', 'Ferry horn, gulls',
   'wide', 'static', 'eye_level', '24 mm', 'ext', 'dawn', 4, 30, 'ready',
   '{"vfx": true}'::jsonb),
  ('dddddddd-0000-4000-8000-000000000002'::uuid, 'Opening', 'V',
   'Mara unlocks the roastery door and switches on the lights.', 'Keys, door bell',
   'medium', 'pan', 'eye_level', '35 mm', 'int', 'dawn', 3, 15, 'ready', '{}'::jsonb),
  ('dddddddd-0000-4000-8000-000000000003'::uuid, 'Opening', 'k',
   'The espresso machine hisses as it warms up.', 'Steam hiss',
   'close_up', 'static', 'low', '85 mm', 'int', 'day', 2, 10, 'planned', '{}'::jsonb),
  ('dddddddd-0000-4000-8000-000000000004'::uuid, 'The pour', 'G',
   'Beans tumble into the grinder.', 'Beans rattling, grinder starts',
   'close_up', 'dolly', 'high', '100 mm macro', 'int', 'day', 5, 20, 'planned',
   '{}'::jsonb),
  ('dddddddd-0000-4000-8000-000000000005'::uuid, 'The pour', 'V',
   'Mara pulls the shot and watches the crema form.', 'Music comes in, soft',
   'medium', 'static', 'eye_level', '50 mm', 'int', 'day', 6, 10, 'planned', '{}'::jsonb),
  ('dddddddd-0000-4000-8000-000000000006'::uuid, 'The pour', 'k',
   'Mara steps onto the pier, cup in hand, and looks across the water.', 'Music up, wind',
   'wide', 'pan', 'eye_level', '24 mm', 'ext', 'day', 4, 25, 'planned',
   '{"vfx": false}'::jsonb)
) as t (id, segment, position, action, audio, shot_size, camera_movement, camera_angle, lens,
        int_ext, day_night, duration_sec, setup_min, status, custom_values)
  on t.segment = s.title
where s.project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

insert into public.shot_talents (shot_id, talent_id, created_by) values
  ('dddddddd-0000-4000-8000-000000000002', '66666666-6666-4666-8666-666666666666',
   '22222222-2222-4222-8222-222222222222'),
  ('dddddddd-0000-4000-8000-000000000003', '77777777-7777-4777-8777-777777777777',
   '22222222-2222-4222-8222-222222222222'),
  ('dddddddd-0000-4000-8000-000000000005', '66666666-6666-4666-8666-666666666666',
   '22222222-2222-4222-8222-222222222222'),
  ('dddddddd-0000-4000-8000-000000000005', '77777777-7777-4777-8777-777777777777',
   '22222222-2222-4222-8222-222222222222'),
  ('dddddddd-0000-4000-8000-000000000006', '66666666-6666-4666-8666-666666666666',
   '22222222-2222-4222-8222-222222222222');

insert into public.shotlist_columns (project_id, key, label, type, position, created_by) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'vfx', 'VFX', 'checkbox', 'V',
   '11111111-1111-4111-8111-111111111111');
