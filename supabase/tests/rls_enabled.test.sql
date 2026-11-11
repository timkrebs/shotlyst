-- Meta test: no table in `public` may exist without Row Level Security.

begin;

select plan(2);

select is_empty(
  $$ select c.relname::text
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every table in public has RLS enabled');

select is_empty(
  $$ select table_name::text
     from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'anon' $$,
  'anon holds no privilege on any table in public');

select * from finish();

rollback;
