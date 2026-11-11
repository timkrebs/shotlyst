-- RPC functions and the profile guard trigger.

begin;

select plan(76);

-- claim_ownership: needs a workspace without an owner ----------------------

select tests.clear_workspace();
select tests.create_user('first@tests.local');
select tests.create_user('second@tests.local');

select tests.authenticate_anon();
select throws_ok(
  $$ select public.claim_ownership('Anon') $$, '42501', null,
  'anon cannot call claim_ownership');

select tests.reset_role();
select tests.create_user('invited@tests.local');
update auth.users set invited_at = now() where email = 'invited@tests.local';
select tests.authenticate_as('invited@tests.local');
select throws_ok(
  $$ select public.claim_ownership('Invited') $$,
  '42501', 'invited accounts cannot claim the workspace',
  'an invited account cannot claim an empty workspace');

select tests.authenticate_as('first@tests.local');
select lives_ok(
  $$ select public.claim_ownership('  ') $$, 'first user claims the empty workspace');
select tests.reset_role();
select results_eq(
  'select display_name, workspace_role::text from public.profiles',
  $$ values ('first', 'owner') $$,
  'the claimer is owner; a blank name falls back to the email local part');

select tests.authenticate_as('second@tests.local');
select throws_ok(
  $$ select public.claim_ownership('Second') $$,
  '42501', 'the workspace already has an owner',
  'a second user cannot claim an owned workspace');
select tests.authenticate_as('first@tests.local');
select throws_ok(
  $$ select public.claim_ownership('Again') $$,
  '42501', 'the workspace already has an owner',
  'the owner cannot claim twice');
select tests.reset_role();
select is((select count(*) from public.profiles), 1::bigint, 'no further profile was created');

-- Standard cast for everything below --------------------------------------

select tests.setup_workspace();

-- next_project_number ------------------------------------------------------

select tests.authenticate_as('editor@tests.local');
select is(
  public.next_project_number(), to_char(now(), 'YYYY') || '-001',
  'numbering starts at 001 when no project of this year exists');
select tests.reset_role();
insert into public.projects (name, project_number)
values ('Hidden', to_char(now(), 'YYYY') || '-041');
select tests.authenticate_as('viewer@tests.local');
select is(
  public.next_project_number(), to_char(now(), 'YYYY') || '-042',
  'numbering counts projects the caller cannot read');
select tests.authenticate_as('outsider@tests.local');
select is(
  public.next_project_number(), to_char(now(), 'YYYY') || '-042',
  'outsider gets the same number');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ select public.next_project_number() $$, '42501', 'not a member',
  'deactivated member gets no project number');
select tests.authenticate_as('stranger@tests.local');
select throws_ok(
  $$ select public.next_project_number() $$, '42501', 'not a member',
  'user without a profile gets no project number');
select tests.authenticate_anon();
select throws_ok(
  $$ select public.next_project_number() $$, '42501', null,
  'anon cannot call next_project_number');

-- list_members -------------------------------------------------------------

select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.list_members()), 7::bigint, 'admin lists all members');
select results_eq(
  $$ select email, workspace_role::text, project_count, deactivated_at is not null
     from public.list_members()
     where id in (tests.uid('owner'), tests.uid('editor'), tests.uid('deactivated'))
     order by id $$,
  $$ values ('owner@tests.local', 'owner', 2::bigint, false),
            ('editor@tests.local', 'member', 1::bigint, false),
            ('deactivated@tests.local', 'member', 1::bigint, true) $$,
  'the list carries email, role, project count and status');
select tests.authenticate_as('owner@tests.local');
select is((select count(*) from public.list_members()), 7::bigint, 'owner lists all members');
select tests.authenticate_as('editor@tests.local');
select throws_ok(
  $$ select * from public.list_members() $$, '42501', 'only owner or admin may list members',
  'editor cannot list members');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ select * from public.list_members() $$, '42501', 'only owner or admin may list members',
  'viewer cannot list members');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ select * from public.list_members() $$, '42501', 'only owner or admin may list members',
  'outsider cannot list members');
select tests.authenticate_anon();
select throws_ok(
  $$ select * from public.list_members() $$, '42501', null, 'anon cannot call list_members');

-- login_allowed / record_login_failure --------------------------------------

select tests.reset_role();
insert into public.login_attempts (key, created_at)
select 'old-key', now() - interval '16 minutes' from generate_series(1, 5);
insert into public.login_attempts (key, created_at)
values ('ancient-key', now() - interval '2 days');

select tests.authenticate_anon();
select ok(public.login_allowed('key-1'), 'a fresh key may sign in');
select lives_ok(
  $$ select public.record_login_failure('key-1') from generate_series(1, 4) $$,
  'anon records four failures');
select ok(public.login_allowed('key-1'), 'four failures do not lock the key');
select lives_ok($$ select public.record_login_failure('key-1') $$, 'anon records a fifth');
select ok(not public.login_allowed('key-1'), 'five failures lock the key');
select ok(public.login_allowed('key-2'), 'another key stays unlocked');
select ok(public.login_allowed('old-key'), 'failures older than 15 minutes do not count');
select tests.authenticate_as('editor@tests.local');
select ok(not public.login_allowed('key-1'), 'the lock holds for signed-in callers too');
select tests.reset_role();
select is_empty(
  $$ select id from public.login_attempts where key = 'ancient-key' $$,
  'recording a failure purges attempts older than a day');
select is(
  (select count(*) from public.login_attempts where key = 'key-1'), 5::bigint,
  'each failure was stored once');

-- Profile guard trigger ------------------------------------------------------

select tests.authenticate_as('editor@tests.local');
select throws_ok(
  $$ update public.profiles set workspace_role = 'admin' where id = tests.uid('editor') $$,
  '42501', 'only owner or admin may change roles',
  'member cannot change their own role');
select is_empty(
  $$ update public.profiles set workspace_role = 'admin' where id = tests.uid('viewer')
     returning id $$,
  'member cannot change the role of someone else');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ update public.profiles set deactivated_at = now() where id = tests.uid('viewer') $$,
  '42501', 'only owner or admin may change roles',
  'member cannot deactivate themselves');

select tests.authenticate_as('admin@tests.local');
select throws_ok(
  $$ update public.profiles set workspace_role = 'member' where id = tests.uid('admin') $$,
  '42501', 'you cannot change your own role or status',
  'admin cannot change their own role');
select throws_ok(
  $$ update public.profiles set workspace_role = 'admin' where id = tests.uid('owner') $$,
  '42501', 'the owner changes only through an ownership transfer',
  'admin cannot demote the owner');
select throws_ok(
  $$ update public.profiles set deactivated_at = now() where id = tests.uid('owner') $$,
  '42501', 'the owner changes only through an ownership transfer',
  'admin cannot deactivate the owner');
select throws_ok(
  $$ update public.profiles set workspace_role = 'owner' where id = tests.uid('viewer') $$,
  '42501', 'the owner changes only through an ownership transfer',
  'admin cannot make a member owner');
select tests.authenticate_as('owner@tests.local');
select throws_ok(
  $$ update public.profiles set workspace_role = 'admin' where id = tests.uid('owner') $$,
  '42501', 'you cannot change your own role or status',
  'owner cannot step down outside an ownership transfer');

select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.profiles set workspace_role = 'admin' where id = tests.uid('commenter')
     returning id $$,
  'admin promotes a member to admin');
select isnt_empty(
  $$ update public.profiles set workspace_role = 'member' where id = tests.uid('commenter')
     returning id $$,
  'admin demotes another admin');
select isnt_empty(
  $$ update public.profiles set deactivated_at = now() where id = tests.uid('editor')
     returning id $$,
  'admin deactivates a member');

-- The deactivated editor of project A loses everything but their own profile.
select tests.authenticate_as('editor@tests.local');
select is_empty('select id from public.projects', 'deactivated editor sees no project');
select is_empty(
  $$ update public.projects set name = 'Hacked' where id = tests.project_a() returning id $$,
  'deactivated editor cannot update project A');
select is_empty('select id from public.brands', 'deactivated editor sees no library');
select throws_ok(
  $$ insert into public.brands (name) values ('By deactivated') $$, '42501', null,
  'deactivated editor cannot insert');
select results_eq(
  'select id from public.profiles', array[tests.uid('editor')],
  'deactivated editor still sees their own profile');
select is_empty(
  $$ update public.profiles set deactivated_at = null where id = tests.uid('editor')
     returning id $$,
  'deactivated editor cannot reactivate themselves');

select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.profiles set deactivated_at = null where id = tests.uid('editor')
     returning id $$,
  'admin reactivates the member');
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select id from public.projects', array[tests.project_a()],
  'reactivated editor sees project A again');

-- accept_invitation ----------------------------------------------------------

select tests.reset_role();
select tests.create_user('new-member@tests.local', 'c0000000-0000-4000-8000-000000000011');
select tests.create_user('new-admin@tests.local', 'c0000000-0000-4000-8000-000000000012');
select tests.create_user('expired@tests.local', 'c0000000-0000-4000-8000-000000000013');
select tests.create_user('accepted@tests.local', 'c0000000-0000-4000-8000-000000000014');
insert into public.invitations (
  email, workspace_role, project_id, project_role, token_hash, expires_at, accepted_at, invited_by
) values
  ('new-member@tests.local', 'member', tests.project_a(), 'commenter',
   tests.token_hash('token-member'), now() + interval '7 days', null, tests.uid('admin')),
  ('new-admin@tests.local', 'admin', null, null,
   tests.token_hash('token-admin'), now() + interval '7 days', null, tests.uid('owner')),
  ('expired@tests.local', 'member', null, null,
   tests.token_hash('token-expired'), now() - interval '1 minute', null, tests.uid('owner')),
  ('accepted@tests.local', 'member', null, null,
   tests.token_hash('token-accepted'), now() + interval '7 days', now(), tests.uid('owner'));

select tests.authenticate_anon();
select throws_ok(
  $$ select public.accept_invitation('token-member', 'Anon') $$, '42501', null,
  'anon cannot call accept_invitation');
select tests.authenticate_as('stranger@tests.local');
select throws_ok(
  $$ select public.accept_invitation('token-member', 'Stranger') $$,
  'P0002', 'invitation is invalid or expired',
  'a token cannot be used by an account with another email');
select tests.authenticate_as('new-member@tests.local');
select throws_ok(
  $$ select public.accept_invitation('wrong-token', 'Nina') $$,
  'P0002', 'invitation is invalid or expired', 'an unknown token is rejected');
select throws_ok(
  $$ select public.accept_invitation('token-admin', 'Nina') $$,
  'P0002', 'invitation is invalid or expired',
  'the token of another invitation is rejected');
select tests.authenticate_as('expired@tests.local');
select throws_ok(
  $$ select public.accept_invitation('token-expired', 'Late') $$,
  'P0002', 'invitation is invalid or expired', 'an expired token is rejected');
select tests.authenticate_as('accepted@tests.local');
select throws_ok(
  $$ select public.accept_invitation('token-accepted', 'Twice') $$,
  'P0002', 'invitation is invalid or expired', 'an accepted token is rejected');

select tests.reset_role();
select is_empty(
  $$ select id from public.profiles where id in (
       tests.uid('stranger'), 'c0000000-0000-4000-8000-000000000011',
       'c0000000-0000-4000-8000-000000000013', 'c0000000-0000-4000-8000-000000000014') $$,
  'rejected attempts created no profile');

select tests.authenticate_as('new-member@tests.local');
select lives_ok(
  $$ select public.accept_invitation('token-member', '  Nina New ') $$,
  'the invited user accepts');
select results_eq(
  'select id from public.projects', array[tests.project_a()],
  'the new member reads the project they were invited to');
select throws_ok(
  $$ select public.accept_invitation('token-member', 'Nina New') $$,
  'P0002', 'this account is already a member', 'a member cannot accept again');

select tests.reset_role();
select results_eq(
  $$ select display_name, workspace_role::text from public.profiles
     where id = 'c0000000-0000-4000-8000-000000000011' $$,
  $$ values ('Nina New', 'member') $$,
  'the profile carries the trimmed name and the invited workspace role');
select results_eq(
  $$ select project_id, role::text, added_by from public.project_members
     where user_id = 'c0000000-0000-4000-8000-000000000011' $$,
  $$ values (tests.project_a(), 'commenter', tests.uid('admin')) $$,
  'the membership carries the invited project role and the inviter');
select isnt_empty(
  $$ select id from public.invitations
     where email = 'new-member@tests.local' and accepted_at is not null $$,
  'the invitation is marked accepted');
select results_eq(
  $$ select project_id, actor_id from public.activity_log
     where action = 'invitation.accepted' $$,
  $$ values (tests.project_a(), 'c0000000-0000-4000-8000-000000000011'::uuid) $$,
  'the acceptance is logged in the project');

select tests.authenticate_as('new-admin@tests.local');
select lives_ok(
  $$ select public.accept_invitation('token-admin', 'Ada Admin') $$,
  'an invitation without a project is accepted');
select is((select count(*) from public.list_members()), 9::bigint,
  'the invited admin may list members at once');

-- transfer_ownership ---------------------------------------------------------

select tests.authenticate_anon();
select throws_ok(
  $$ select public.transfer_ownership(tests.uid('editor')) $$, '42501', null,
  'anon cannot call transfer_ownership');
select tests.authenticate_as('admin@tests.local');
select throws_ok(
  $$ select public.transfer_ownership(tests.uid('admin')) $$,
  '42501', 'only the owner may transfer ownership', 'admin cannot take ownership');
select tests.authenticate_as('editor@tests.local');
select throws_ok(
  $$ select public.transfer_ownership(tests.uid('editor')) $$,
  '42501', 'only the owner may transfer ownership', 'member cannot take ownership');
select tests.authenticate_as('owner@tests.local');
select throws_ok(
  $$ select public.transfer_ownership(tests.uid('owner')) $$,
  '22023', 'the new owner must be another active member',
  'owner cannot transfer to themselves');
select throws_ok(
  $$ select public.transfer_ownership(tests.uid('deactivated')) $$,
  '22023', 'the new owner must be another active member',
  'owner cannot transfer to a deactivated member');
select throws_ok(
  $$ select public.transfer_ownership(tests.uid('stranger')) $$,
  '22023', 'the new owner must be another active member',
  'owner cannot transfer to a user without a profile');
select lives_ok(
  $$ select public.transfer_ownership(tests.uid('editor')) $$,
  'owner transfers the workspace to a member');

select tests.reset_role();
select results_eq(
  $$ select id, workspace_role::text from public.profiles
     where id in (tests.uid('owner'), tests.uid('editor')) order by id $$,
  $$ values (tests.uid('owner'), 'admin'), (tests.uid('editor'), 'owner') $$,
  'the old owner is admin, the new owner is owner');
select is(
  (select count(*) from public.profiles where workspace_role = 'owner'), 1::bigint,
  'there is exactly one owner');

select tests.authenticate_as('owner@tests.local');
select throws_ok(
  $$ select public.transfer_ownership(tests.uid('viewer')) $$,
  '42501', 'only the owner may transfer ownership',
  'the former owner cannot transfer again');
select tests.authenticate_as('editor@tests.local');
select is((select count(*) from public.projects), 3::bigint,
  'the new owner reads every project');

select * from finish();

rollback;
