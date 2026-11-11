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
