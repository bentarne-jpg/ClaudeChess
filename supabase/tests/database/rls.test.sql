-- Runs on the real Supabase stack in CI (`supabase test db`): migrations, the profile trigger on the
-- real auth.users, and row-level security with Supabase's own auth.uid() (manifest S3, S5).
begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.com', '{"full_name":"Alice"}'),
       ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.com', '{}');
insert into public.ratings (user_id, pool, rating, best) values
  ('11111111-1111-4111-8111-111111111111', 'puzzle', 1200, 1200), ('22222222-2222-4222-8222-222222222222', 'puzzle', 1800, 1800);

select results_eq($$ select display_name from public.profiles order by display_name $$, $$ values ('Alice'), ('Spiller') $$, 'profiles are created from the login');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select results_eq($$ select rating from public.ratings $$, $$ values (1200::double precision) $$, 'users see only their own ratings');
select throws_ok($$ update public.ratings set rating = 3000 $$, '42501', null, 'users cannot change ratings');
select throws_ok($$ insert into public.puzzle_attempts (user_id, puzzle_id, puzzle_rating, solved, rating_before, rating_after)
  values ('11111111-1111-4111-8111-111111111111', 'x', 1, true, 1, 1) $$, '42501', null, 'users cannot write puzzle attempts');
select lives_ok($$ insert into public.user_docs (user_id, name, data) values ('11111111-1111-4111-8111-111111111111', 'botgame', '{}') $$, 'users keep their own documents');
select throws_ok($$ insert into public.user_docs (user_id, name, data) values ('22222222-2222-4222-8222-222222222222', 'botgame', '{}') $$, '42501', null, 'but not other people''s');

select throws_ok($$ insert into public.moves (game_id, ply, uci, san, fen) values (gen_random_uuid(), 1, 'e2e4', 'e4', 'x') $$, '42501', null, 'users cannot write moves');

reset role;
set local role anon;
select throws_ok($$ select * from public.ratings $$, '42501', null, 'anonymous visitors see nothing');

select * from finish();
rollback;
