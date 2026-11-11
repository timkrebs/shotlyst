-- RLS on public.project_members: readable inside the project, managed by its
-- editors (and by owner and admin).

begin;

select plan(28);

select tests.setup_workspace();

-- select: project A has owner, editor, commenter, viewer, deactivated;
-- project B has owner and outsider.
select tests.authenticate_as('editor@tests.local');
select is((select count(*) from public.project_members), 5::bigint,
  'editor sees the members of project A only');
select tests.authenticate_as('viewer@tests.local');
select is((select count(*) from public.project_members), 5::bigint,
  'viewer sees the members of project A only');
select is_empty(
  $$ select id from public.project_members where project_id = tests.project_b() $$,
  'viewer sees no member of project B');
select tests.authenticate_as('outsider@tests.local');
select is((select count(*) from public.project_members), 2::bigint,
  'outsider sees the members of project B only');
select is_empty(
  $$ select id from public.project_members where project_id = tests.project_a() $$,
  'outsider sees no member of project A');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.project_members), 7::bigint, 'admin sees all members');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.project_members',
  'deactivated member sees no memberships, not even their own');

-- insert
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.project_members (project_id, user_id, role)
     values (tests.project_a(), tests.uid('outsider'), 'viewer') $$,
  '42501', null, 'viewer cannot add a member to project A');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into public.project_members (project_id, user_id, role)
     values (tests.project_a(), tests.uid('outsider'), 'viewer') $$,
  '42501', null, 'commenter cannot add a member to project A');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.project_members (project_id, user_id, role)
     values (tests.project_a(), tests.uid('outsider'), 'editor') $$,
  '42501', null, 'outsider cannot add themselves to project A');
select tests.authenticate_as('editor@tests.local');
select throws_ok(
  $$ insert into public.project_members (project_id, user_id, role)
     values (tests.project_b(), tests.uid('editor'), 'editor') $$,
  '42501', null, 'editor of project A cannot add themselves to project B');
select lives_ok(
  $$ insert into public.project_members (project_id, user_id, role)
     values (tests.project_a(), tests.uid('outsider'), 'viewer') $$,
  'editor adds a member to project A');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.project_members (project_id, user_id, role)
     values (tests.project_b(), tests.uid('viewer'), 'commenter') $$,
  'admin adds a member to project B');

-- update
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.project_members set role = 'editor'
     where project_id = tests.project_a() and user_id = tests.uid('viewer') returning id $$,
  'viewer cannot promote themselves');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.project_members set role = 'editor'
     where project_id = tests.project_a() and user_id = tests.uid('commenter') returning id $$,
  'commenter cannot promote themselves');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.project_members set role = 'editor'
     where project_id = tests.project_a() and user_id = tests.uid('outsider') returning id $$,
  'outsider, now viewer of project A, cannot promote themselves');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.project_members set role = 'commenter'
     where project_id = tests.project_a() and user_id = tests.uid('viewer') returning id $$,
  'editor changes a role in project A');
select throws_ok(
  $$ update public.project_members set project_id = tests.project_b()
     where project_id = tests.project_a() and user_id = tests.uid('commenter') $$,
  '42501', null, 'editor cannot move a membership into project B');

select tests.reset_role();
select results_eq(
  $$ select user_id, role::text from public.project_members
     where project_id = tests.project_a()
       and user_id in (tests.uid('commenter'), tests.uid('viewer'), tests.uid('outsider'))
     order by user_id $$,
  $$ values (tests.uid('commenter'), 'commenter'), (tests.uid('viewer'), 'commenter'),
            (tests.uid('outsider'), 'viewer') $$,
  'only the editor change was stored');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ delete from public.project_members where project_id = tests.project_a() returning id $$,
  'viewer (now commenter) cannot remove members of project A');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.project_members where project_id = tests.project_a() returning id $$,
  'outsider cannot remove members of project A');
select tests.authenticate_as('editor@tests.local');
select is_empty(
  $$ delete from public.project_members where project_id = tests.project_b() returning id $$,
  'editor of project A cannot remove members of project B');
select isnt_empty(
  $$ delete from public.project_members
     where project_id = tests.project_a() and user_id = tests.uid('commenter') returning id $$,
  'editor removes a member of project A');

select tests.reset_role();
select is((select count(*) from public.project_members), 8::bigint,
  'exactly one membership was removed');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.project_members', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.project_members (project_id, user_id, role)
     values (tests.project_a(), tests.uid('stranger'), 'editor') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.project_members set role = 'editor' $$, '42501', null,
  'anon cannot update');
select throws_ok('delete from public.project_members', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
