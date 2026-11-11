-- RLS on public.login_attempts: no policy and no privilege for API roles.
-- Only login_allowed() and record_login_failure() reach the table; they are
-- covered in functions.test.sql.

begin;

select plan(23);

select tests.setup_workspace();
insert into public.login_attempts (key) values ('existing-key');

select policies_are('public', 'login_attempts', array[]::name[],
  'login_attempts has no policies');
select table_privs_are('public', 'login_attempts', 'authenticated', array[]::text[],
  'authenticated holds no privilege on login_attempts');
select table_privs_are('public', 'login_attempts', 'anon', array[]::text[],
  'anon holds no privilege on login_attempts');

select tests.authenticate_as('editor@tests.local');
select throws_ok('select * from public.login_attempts', '42501', null, 'editor cannot select');
select throws_ok(
  $$ insert into public.login_attempts (key) values ('k') $$, '42501', null,
  'editor cannot insert');
select throws_ok(
  $$ update public.login_attempts set key = 'k' $$, '42501', null, 'editor cannot update');
select throws_ok('delete from public.login_attempts', '42501', null, 'editor cannot delete');

select tests.authenticate_as('viewer@tests.local');
select throws_ok('select * from public.login_attempts', '42501', null, 'viewer cannot select');
select throws_ok(
  $$ insert into public.login_attempts (key) values ('k') $$, '42501', null,
  'viewer cannot insert');
select throws_ok(
  $$ update public.login_attempts set key = 'k' $$, '42501', null, 'viewer cannot update');
select throws_ok('delete from public.login_attempts', '42501', null, 'viewer cannot delete');

select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  'select * from public.login_attempts', '42501', null, 'outsider cannot select');
select throws_ok(
  $$ insert into public.login_attempts (key) values ('k') $$, '42501', null,
  'outsider cannot insert');
select throws_ok(
  $$ update public.login_attempts set key = 'k' $$, '42501', null, 'outsider cannot update');
select throws_ok('delete from public.login_attempts', '42501', null, 'outsider cannot delete');

select tests.authenticate_as('owner@tests.local');
select throws_ok('select * from public.login_attempts', '42501', null, 'owner cannot select');
select throws_ok(
  $$ insert into public.login_attempts (key) values ('k') $$, '42501', null,
  'owner cannot insert');
select throws_ok('delete from public.login_attempts', '42501', null, 'owner cannot delete');

select tests.authenticate_anon();
select throws_ok('select * from public.login_attempts', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.login_attempts (key) values ('k') $$, '42501', null,
  'anon cannot insert');
select throws_ok(
  $$ update public.login_attempts set key = 'k' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.login_attempts', '42501', null, 'anon cannot delete');

select tests.reset_role();
select results_eq('select key from public.login_attempts', array['existing-key'],
  'the table is unchanged');

select * from finish();

rollback;
