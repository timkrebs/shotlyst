-- RLS on public.profiles: members see each other, edit themselves; admins
-- edit members; nobody inserts or deletes through the API.

begin;

select plan(27);

select tests.setup_workspace();

-- select
select tests.authenticate_as('editor@tests.local');
select is((select count(*) from public.profiles), 7::bigint, 'editor sees every profile');
select tests.authenticate_as('viewer@tests.local');
select is((select count(*) from public.profiles), 7::bigint, 'viewer sees every profile');
select tests.authenticate_as('outsider@tests.local');
select is((select count(*) from public.profiles), 7::bigint, 'outsider sees every profile');
select tests.authenticate_as('deactivated@tests.local');
select results_eq(
  'select id from public.profiles',
  array[tests.uid('deactivated')],
  'deactivated member sees only their own profile');
select tests.authenticate_as('stranger@tests.local');
select is_empty('select id from public.profiles', 'user without a profile sees nobody');

-- insert: no policy, so nobody may
select tests.authenticate_as('editor@tests.local');
select throws_ok(
  $$ insert into public.profiles (id, display_name) values (tests.uid('stranger'), 'X') $$,
  '42501', null, 'editor cannot insert a profile');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.profiles (id, display_name) values (tests.uid('stranger'), 'X') $$,
  '42501', null, 'viewer cannot insert a profile');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.profiles (id, display_name) values (tests.uid('stranger'), 'X') $$,
  '42501', null, 'outsider cannot insert a profile');
select tests.authenticate_as('owner@tests.local');
select throws_ok(
  $$ insert into public.profiles (id, display_name) values (tests.uid('stranger'), 'X') $$,
  '42501', null, 'owner cannot insert a profile directly');
select tests.authenticate_as('stranger@tests.local');
select throws_ok(
  $$ insert into public.profiles (id, display_name, workspace_role)
     values (tests.uid('stranger'), 'X', 'admin') $$,
  '42501', null, 'user without a profile cannot create their own');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.profiles set display_name = 'Eddie' where id = tests.uid('editor')
     returning id $$,
  'editor updates their own profile');
select is_empty(
  $$ update public.profiles set display_name = 'Hacked' where id = tests.uid('viewer')
     returning id $$,
  'editor cannot update another profile');
select tests.authenticate_as('viewer@tests.local');
select isnt_empty(
  $$ update public.profiles set color = '#112233' where id = tests.uid('viewer')
     returning id $$,
  'viewer updates their own profile');
select is_empty(
  $$ update public.profiles set display_name = 'Hacked' where id = tests.uid('owner')
     returning id $$,
  'viewer cannot update the owner profile');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.profiles set display_name = 'Hacked' where id <> tests.uid('outsider')
     returning id $$,
  'outsider cannot update other profiles');
select tests.authenticate_as('deactivated@tests.local');
select is_empty(
  $$ update public.profiles set display_name = 'Back' where id = tests.uid('deactivated')
     returning id $$,
  'deactivated member cannot update their own profile');
select tests.authenticate_as('admin@tests.local');
select throws_ok(
  $$ update public.profiles set display_name = 'Renamed' where id = tests.uid('commenter') $$,
  '42501', 'only the member may edit their own profile',
  'admin cannot rename another member');

select tests.reset_role();
select results_eq(
  $$ select display_name from public.profiles
     where id in (tests.uid('editor'), tests.uid('viewer'), tests.uid('owner'),
                  tests.uid('deactivated'), tests.uid('commenter'))
     order by id $$,
  array['Owner', 'Eddie', 'Commenter', 'Viewer', 'Deactivated'],
  'only the allowed updates were stored');

-- delete: no policy, so nobody may
select tests.authenticate_as('editor@tests.local');
select is_empty('delete from public.profiles returning id', 'editor cannot delete profiles');
select tests.authenticate_as('viewer@tests.local');
select is_empty('delete from public.profiles returning id', 'viewer cannot delete profiles');
select tests.authenticate_as('outsider@tests.local');
select is_empty('delete from public.profiles returning id', 'outsider cannot delete profiles');
select tests.authenticate_as('owner@tests.local');
select is_empty('delete from public.profiles returning id', 'owner cannot delete profiles');
select tests.reset_role();
select is((select count(*) from public.profiles), 7::bigint, 'all profiles survived');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.profiles (id, display_name) values (tests.uid('stranger'), 'X') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.profiles set display_name = 'X' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.profiles', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
