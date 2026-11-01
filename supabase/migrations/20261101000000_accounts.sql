-- Accounts, ratings, games and per-user documents (ARCHITECTURE.md §5, ADR-0002).
-- Fairness data (ratings, puzzle attempts, rated games) is written only by the `api` Edge Function
-- (service role) — the anon and authenticated roles can read their own rows but never write them (S5).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Spiller' check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

create type public.rating_pool as enum ('puzzle', 'bot', 'bullet', 'blitz', 'rapid', 'classical');

create table public.ratings (
  user_id uuid not null references auth.users (id) on delete cascade,
  pool public.rating_pool not null,
  rating double precision not null,
  rd double precision not null default 350,
  vol double precision not null default 0.06,
  games integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  streak integer not null default 0,
  best double precision not null,
  imported boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, pool)
);

create table public.puzzle_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  puzzle_id text not null,
  puzzle_rating integer not null,
  solved boolean not null,
  reason text,
  rating_before double precision not null,
  rating_after double precision not null,
  created_at timestamptz not null default now(),
  unique (user_id, puzzle_id)
);
create index on public.puzzle_attempts (user_id, created_at desc);

create type public.game_kind as enum ('bot', 'pvp');
create type public.game_status as enum ('open', 'active', 'finished', 'aborted');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  kind public.game_kind not null,
  status public.game_status not null,
  rated boolean not null default true,
  time_control jsonb,                      -- {"m": minutes, "i": increment seconds} or null
  pool public.rating_pool,
  white_id uuid references auth.users (id) on delete set null,
  black_id uuid references auth.users (id) on delete set null,
  bot_rating integer,
  created_by uuid references auth.users (id) on delete set null,
  client_id text check (char_length(client_id) <= 80),
  start_fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  result text check (result in ('1-0', '0-1', '1/2-1/2')),
  reason text,
  pgn text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);
create unique index games_client_id on public.games (created_by, client_id) where client_id is not null;
create index on public.games (white_id, ended_at desc);
create index on public.games (black_id, ended_at desc);

create table public.game_players (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  color char(1) not null check (color in ('w', 'b')),
  rating_before double precision,
  rating_after double precision,
  primary key (game_id, color)
);

-- Documents the app keeps per user (game in progress, saved games and their analysis).
-- These do not affect ratings, so users may write their own — except reserved names.
create table public.user_docs (
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (name ~ '^[A-Za-z0-9_.:-]{1,80}$' and name not in ('puzzleprofile')),
  kind text generated always as (data ->> 'kind') stored,
  data jsonb not null check (pg_column_size(data) < 200000),
  updated_at timestamptz not null default now(),
  primary key (user_id, name)
);

-- Row-level security ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.ratings enable row level security;
alter table public.puzzle_attempts enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.user_docs enable row level security;

create policy "read own profile and opponents" on public.profiles for select to authenticated using (true);
create policy "rename yourself" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "read own ratings" on public.ratings for select to authenticated using (user_id = (select auth.uid()));
create policy "read own attempts" on public.puzzle_attempts for select to authenticated using (user_id = (select auth.uid()));
create policy "read own games" on public.games for select to authenticated
  using ((select auth.uid()) in (white_id, black_id));
create policy "read own game players" on public.game_players for select to authenticated
  using (exists (select 1 from public.games g where g.id = game_id and (select auth.uid()) in (g.white_id, g.black_id)));

create policy "own docs" on public.user_docs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Explicit grants: no writes to fairness tables from client roles.
revoke all on public.ratings, public.puzzle_attempts, public.games, public.game_players from anon, authenticated;
grant select on public.ratings, public.puzzle_attempts, public.games, public.game_players to authenticated;
revoke all on public.profiles, public.user_docs from anon;
grant select, update (display_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.user_docs to authenticated;

-- A profile for every new account, named from the login provider when it gives a name.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
                                nullif(trim(new.raw_user_meta_data ->> 'name'), ''), 'Spiller'), 40));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
