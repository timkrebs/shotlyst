-- RLS on public.moodboards: every project role reads, only editors (and
-- workspace admins) write. Each project starts with one seeded board called
-- "Moodboard".

begin;

select plan(34);

select tests.setup_workspace();
insert into public.moodboards (id, project_id, title) values
  ('bd000000-0000-4000-8000-000000000001', tests.project_a(), 'Look A'),
  ('bd000000-0000-4000-8000-000000000002', tests.project_a(), 'Wardrobe A'),
  ('bd000000-0000-4000-8000-000000000003', tests.project_b(), 'Look B');

-- select
select tests.authenticate_as('editor@tests.local');
select results_eq(
  'select title from public.moodboards order by title',
  array['Look A', 'Moodboard', 'Wardrobe A'], 'editor sees the boards of project A');
select tests.authenticate_as('commenter@tests.local');
select results_eq(
  'select title from public.moodboards order by title',
  array['Look A', 'Moodboard', 'Wardrobe A'], 'commenter sees the boards of project A');
select tests.authenticate_as('viewer@tests.local');
select results_eq(
  'select title from public.moodboards order by title',
  array['Look A', 'Moodboard', 'Wardrobe A'], 'viewer sees the boards of project A');
select tests.authenticate_as('outsider@tests.local');
select results_eq(
  'select title from public.moodboards order by title',
  array['Look B', 'Moodboard'], 'outsider sees project B only');
select tests.authenticate_as('admin@tests.local');
select is((select count(*) from public.moodboards), 5::bigint, 'admin sees every board');
select tests.authenticate_as('deactivated@tests.local');
select is_empty('select id from public.moodboards', 'deactivated member sees no boards');
select tests.authenticate_as('stranger@tests.local');
select is_empty('select id from public.moodboards', 'user without a profile sees no boards');

-- insert
select tests.authenticate_as('editor@tests.local');
select lives_ok(
  $$ insert into public.moodboards (project_id, title) values (tests.project_a(), 'New A') $$,
  'editor adds a board to project A');
select is(
  (select created_by from public.moodboards where title = 'New A'), tests.uid('editor'),
  'created_by defaults to the caller');
select throws_ok(
  $$ insert into public.moodboards (project_id, title) values (tests.project_b(), 'X') $$,
  '42501', null, 'editor of project A cannot add a board to project B');
select tests.authenticate_as('commenter@tests.local');
select throws_ok(
  $$ insert into public.moodboards (project_id, title) values (tests.project_a(), 'X') $$,
  '42501', null, 'commenter cannot add a board');
select tests.authenticate_as('viewer@tests.local');
select throws_ok(
  $$ insert into public.moodboards (project_id, title) values (tests.project_a(), 'X') $$,
  '42501', null, 'viewer cannot add a board');
select tests.authenticate_as('outsider@tests.local');
select throws_ok(
  $$ insert into public.moodboards (project_id, title) values (tests.project_a(), 'X') $$,
  '42501', null, 'outsider cannot add a board to project A');
select lives_ok(
  $$ insert into public.moodboards (project_id, title) values (tests.project_b(), 'New B') $$,
  'outsider adds a board to project B');
select tests.authenticate_as('admin@tests.local');
select lives_ok(
  $$ insert into public.moodboards (project_id, title) values (tests.project_b(), 'Admin B') $$,
  'admin adds a board without being a project member');
select tests.authenticate_as('deactivated@tests.local');
select throws_ok(
  $$ insert into public.moodboards (project_id, title) values (tests.project_a(), 'X') $$,
  '42501', null, 'deactivated editor cannot add a board');

-- update
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ update public.moodboards set title = 'Look A renamed'
     where id = 'bd000000-0000-4000-8000-000000000001' returning id $$,
  'editor renames a board of project A');
select throws_ok(
  $$ update public.moodboards set project_id = tests.project_b()
     where id = 'bd000000-0000-4000-8000-000000000001' $$,
  '23514', 'a row cannot move to another project', 'editor cannot move a board into project B');
select is_empty(
  $$ update public.moodboards set title = 'hacked'
     where id = 'bd000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot update a board of project B');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  $$ update public.moodboards set title = 'hacked' returning id $$,
  'commenter cannot update boards');
select tests.authenticate_as('viewer@tests.local');
select is_empty(
  $$ update public.moodboards set title = 'hacked' returning id $$,
  'viewer cannot update boards');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ update public.moodboards set title = 'hacked'
     where project_id = tests.project_a() returning id $$,
  'outsider cannot update boards of project A');
select tests.authenticate_as('admin@tests.local');
select isnt_empty(
  $$ update public.moodboards set title = 'Look B renamed'
     where id = 'bd000000-0000-4000-8000-000000000003' returning id $$,
  'admin renames a board of project B');

select tests.reset_role();
select results_eq(
  $$ select title from public.moodboards where id::text like 'bd000000-%' order by id $$,
  array['Look A renamed', 'Wardrobe A', 'Look B renamed'],
  'only the allowed updates were stored');

-- delete
select tests.authenticate_as('viewer@tests.local');
select is_empty('delete from public.moodboards returning id', 'viewer cannot delete boards');
select tests.authenticate_as('commenter@tests.local');
select is_empty(
  'delete from public.moodboards returning id', 'commenter cannot delete boards');
select tests.authenticate_as('outsider@tests.local');
select is_empty(
  $$ delete from public.moodboards where project_id = tests.project_a() returning id $$,
  'outsider cannot delete boards of project A');
select tests.authenticate_as('editor@tests.local');
select isnt_empty(
  $$ delete from public.moodboards
     where id = 'bd000000-0000-4000-8000-000000000001' returning id $$,
  'editor deletes a board of project A');
select is_empty(
  $$ delete from public.moodboards
     where id = 'bd000000-0000-4000-8000-000000000003' returning id $$,
  'editor of project A cannot delete a board of project B');

select tests.reset_role();
select results_eq(
  $$ select id from public.moodboards where id::text like 'bd000000-%' order by id $$,
  array['bd000000-0000-4000-8000-000000000002'::uuid,
        'bd000000-0000-4000-8000-000000000003'::uuid],
  'only the allowed delete took effect');

-- anonymous
select tests.authenticate_anon();
select throws_ok('select * from public.moodboards', '42501', null, 'anon cannot select');
select throws_ok(
  $$ insert into public.moodboards (project_id, title) values (tests.project_a(), 'anon') $$,
  '42501', null, 'anon cannot insert');
select throws_ok(
  $$ update public.moodboards set title = 'anon' $$, '42501', null, 'anon cannot update');
select throws_ok('delete from public.moodboards', '42501', null, 'anon cannot delete');

select * from finish();

rollback;
