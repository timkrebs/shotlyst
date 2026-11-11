-- RLS on public.app_settings: every active member reads, owner and admin write.

begin;

select plan(24);

select tests.setup_workspace();
insert into public.app_settings (key, value, created_by)
values ('default_timezone', '"UTC"', tests.uid('owner'));

-- select
select tests.authenticate_as('editor@tests.local');
select is((select count(*) from public.app_settings), 1::bigint, 'editor reads settings');
select tests.authenticate_as('viewer@tests.local');
select is((select count(*) from public.app_settings), 1::bigint, 'viewer reads settings');
select tests.authenticate_as('outsider@tests.local');
select is((select count(*) from public.app_settings), 1::bigint, 'outsider reads settings');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.app_settings', 'deactivated member reads nothing');
select tests.authenticate_as('stranger@tests.local');
select is_empty('select id from public.app_settings', 'user without a profile reads nothing');

-- insert
select tests.authenticate_as('editor@tests.local');
select throws_ok(
  $$ insert into public.app_settings (key, value) values ('k_editor', '1') $$,
  '42501', null, 'editor cannot insert a setting');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.app_settings (key, value) values ('k_viewer', '1') $$,
  '42501', null, 'viewer cannot insert a setting');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.app_settings (key, value) values ('k_outsider', '1') $$,
  '42501', null, 'outsider cannot insert a setting');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.app_settings (key, value) values ('k_admin', '1') $$,
  'admin inserts a setting');
select tests.authenticate_as('owner@tests.local');
select lives_ok(
  $$ insert into public.app_settings (key, value) values ('k_owner', '1') $$,
  'owner inserts a setting');

-- update
select tests.authenticate_as('editor@tests.local');
select is_empty(
  $$ update public.app_settings set value = '"X"' returning id $$,
  'editor cannot update settings');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.app_settings set value = '"X"' returning id $$,
  'viewer cannot update settings');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.app_settings set value = '"X"' returning id $$,
  'outsider cannot update settings');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.app_settings set value = '"Europe/Berlin"'
     where key = 'default_timezone' returning id $$,
  'admin updates a setting');

-- delete
select tests.authenticate_as('editor@tests.local');
select is_empty('delete from public.app_settings returning id', 'editor cannot delete settings');
select tests.authenticate_as('viewer@tests.local');
select is_empty('delete from public.app_settings returning id', 'viewer cannot delete settings');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  'delete from public.app_settings returning id', 'outsider cannot delete settings');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ delete from public.app_settings where key = 'k_owner' returning id $$,
  'admin deletes a setting');
select tests.authenticate_as('owner@tests.local');
select isnt_empty(
  $$ delete from public.app_settings where key = 'k_admin' returning id $$,
  'owner deletes a setting');

select tests.reset_role();
select results_eq(
  'select key, value from public.app_settings',
  $$ values ('default_timezone', '"Europe/Berlin"'::jsonb) $$,
  'only the admin changes were stored');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.app_settings', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.app_settings (key, value) values ('k_anon', '1') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.app_settings set value = '1' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.app_settings', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
