-- RLS on public.shot_talents (the cast of a shot): every project role reads,
-- only editors (and workspace admins) write. project_id comes from the shot.

begin;

select plan(35);

select tests.setup_workspace();
insert into public.talents (id, name, type, created_by) values
  ('7a000000-0000-4000-8000-000000000001', 'Lead', 'person', tests.uid('owner')),
  ('7a000000-0000-4000-8000-000000000002', 'Prop', 'object', tests.uid('owner')),
  ('7a000000-0000-4000-8000-000000000003', 'Dog', 'animal', tests.uid('owner'));
insert into public.shots (id, segment_id, position) values
  ('50000000-0000-4000-8000-000000000001', tests.segment_id(tests.project_a()), 'G'),
  ('50000000-0000-4000-8000-000000000002', tests.segment_id(tests.project_a()), 'V'),
  ('50000000-0000-4000-8000-000000000003', tests.segment_id(tests.project_b()), 'G');
insert into public.shot_talents (id, shot_id, talent_id) values
  ('57000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001',
   '7a000000-0000-4000-8000-000000000001'),
  ('57000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000003',
   '7a000000-0000-4000-8000-000000000001');

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select id from public.shot_talents',
  array['57000000-0000-4000-8000-000000000001'::uuid], 'editor sees the cast of project A');
select tests.authenticate_as('commenter@tests.local');
select results_eq(
  'select id from public.shot_talents',
  array['57000000-0000-4000-8000-000000000001'::uuid], 'commenter sees the cast of project A');
select tests.authenticate_as('viewer@tests.local');
select results_eq(
  'select id from public.shot_talents',
  array['57000000-0000-4000-8000-000000000001'::uuid], 'viewer sees the cast of project A');
select tests.authenticate_as('outsider@tests.local');
select results_eq(
  'select id from public.shot_talents',
  array['57000000-0000-4000-8000-000000000002'::uuid], 'outsider sees project B only');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.shot_talents), 2::bigint, 'admin sees every cast link');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.shot_talents', 'deactivated member sees no cast');
select tests.authenticate_as('stranger@tests.local');
select is_empty('select id from public.shot_talents', 'user without a profile sees no cast');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.shot_talents (id, shot_id, talent_id)
     values ('57000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-000000000001',
             '7a000000-0000-4000-8000-000000000002') $$,
  'editor casts a talent in a shot of project A');
select results_eq(
  $$ select project_id, created_by from public.shot_talents
     where id = '57000000-0000-4000-8000-00000000000a' $$,
  $$ values (tests.project_a(), tests.uid('editor')) $$,
  'the link takes its project from the shot and its creator from the caller');
select throws_ok(
  $$ insert into public.shot_talents (shot_id, talent_id)
     values ('50000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000002') $$,
  '23505', null, 'a talent cannot be cast twice in the same shot');
select throws_ok(
  $$ insert into public.shot_talents (shot_id, talent_id)
     values ('50000000-0000-4000-8000-000000000003', '7a000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'editor of project A cannot cast a talent in a shot of project B');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into public.shot_talents (shot_id, talent_id)
     values ('50000000-0000-4000-8000-000000000002', '7a000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'commenter cannot cast a talent');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.shot_talents (shot_id, talent_id)
     values ('50000000-0000-4000-8000-000000000002', '7a000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'viewer cannot cast a talent');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.shot_talents (shot_id, talent_id)
     values ('50000000-0000-4000-8000-000000000002', '7a000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'outsider cannot cast a talent in a shot of project A');
select lives_ok(
  $$ insert into public.shot_talents (shot_id, talent_id)
     values ('50000000-0000-4000-8000-000000000003', '7a000000-0000-4000-8000-000000000002') $$,
  'outsider casts a talent in a shot of project B');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.shot_talents (shot_id, talent_id)
     values ('50000000-0000-4000-8000-000000000002', '7a000000-0000-4000-8000-000000000002') $$,
  'admin casts a talent without being a project member');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.shot_talents (shot_id, talent_id)
     values ('50000000-0000-4000-8000-000000000002', '7a000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'deactivated editor cannot cast a talent');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.shot_talents set shot_id = '50000000-0000-4000-8000-000000000002'
     where id = '57000000-0000-4000-8000-000000000001' returning id $$,
  'editor moves a cast link to another shot of project A');
select throws_ok(
  $$ update public.shot_talents set shot_id = '50000000-0000-4000-8000-000000000003',
                                    talent_id = '7a000000-0000-4000-8000-000000000003'
     where id = '57000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'editor cannot move a cast link to a shot of project B');
select is_empty(
  $$ update public.shot_talents set talent_id = '7a000000-0000-4000-8000-000000000003'
     where id = '57000000-0000-4000-8000-000000000002' returning id $$,
  'editor of project A cannot update a cast link of project B');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.shot_talents set talent_id = '7a000000-0000-4000-8000-000000000003'
     returning id $$,
  'commenter cannot update cast links');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.shot_talents set talent_id = '7a000000-0000-4000-8000-000000000003'
     returning id $$,
  'viewer cannot update cast links');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.shot_talents set talent_id = '7a000000-0000-4000-8000-000000000003'
     where project_id = tests.project_a() returning id $$,
  'outsider cannot update cast links of project A');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.shot_talents set talent_id = '7a000000-0000-4000-8000-000000000003'
     where id = '57000000-0000-4000-8000-000000000002' returning id $$,
  'admin updates a cast link of project B');

select tests.reset_role();
select results_eq(
  $$ select shot_id, talent_id, project_id from public.shot_talents
     where id::text like '57000000-0000-4000-8000-00000000000_'
       and id <> '57000000-0000-4000-8000-00000000000a' order by id $$,
  $$ values ('50000000-0000-4000-8000-000000000002'::uuid,
             '7a000000-0000-4000-8000-000000000001'::uuid, tests.project_a()),
            ('50000000-0000-4000-8000-000000000003'::uuid,
             '7a000000-0000-4000-8000-000000000003'::uuid, tests.project_b()) $$,
  'only the allowed updates were stored');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty('delete from public.shot_talents returning id', 'viewer cannot delete cast links');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  'delete from public.shot_talents returning id', 'commenter cannot delete cast links');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.shot_talents where project_id = tests.project_a() returning id $$,
  'outsider cannot delete cast links of project A');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ delete from public.shot_talents
     where id = '57000000-0000-4000-8000-000000000001' returning id $$,
  'editor deletes a cast link of project A');
select is_empty(
  $$ delete from public.shot_talents
     where id = '57000000-0000-4000-8000-000000000002' returning id $$,
  'editor of project A cannot delete a cast link of project B');

select tests.reset_role();
select results_eq(
  $$ select project_id, count(*) from public.shot_talents
     group by project_id order by project_id $$,
  $$ values (tests.project_a(), 2::bigint), (tests.project_b(), 2::bigint) $$,
  'only the allowed delete took effect');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.shot_talents', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.shot_talents (shot_id, talent_id)
     values ('50000000-0000-4000-8000-000000000002', '7a000000-0000-4000-8000-000000000003') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.shot_talents set talent_id = '7a000000-0000-4000-8000-000000000003' $$,
  '42501', null, 'anon cannot update');
select throws_ok('delete from public.shot_talents', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
