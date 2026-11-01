-- A minimal stand-in for Supabase's auth schema and roles, so migrations and row-level security
-- can be tested on plain Postgres (CI runs the same tests on the real Supabase stack too).
do $$
declare r text;
begin
  -- Roles are shared by the whole cluster and test files run in parallel, so tolerate a race.
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    begin
      execute format('create role %I nologin%s', r, case when r = 'service_role' then ' bypassrls' else '' end);
    exception when duplicate_object or unique_violation then null;
    end;
  end loop;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
grant all on all tables in schema public to service_role;
