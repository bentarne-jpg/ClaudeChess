-- Person-vs-person games (phase 3). The server (api Edge Function) validates every move and keeps the
-- clocks; clients only read, and get updates through Realtime (manifest S4).
alter table public.games
  add column invite_code text unique check (invite_code ~ '^[a-z0-9]{10}$'),
  add column creator_color text check (creator_color in ('w', 'b', 'random')),
  add column fen text,
  add column ply integer not null default 0,
  add column clock jsonb,                 -- the domain Clock, times in ms, `since` in epoch ms
  add column draw_offer char(1) check (draw_offer in ('w', 'b'));

create table public.moves (
  game_id uuid not null references public.games (id) on delete cascade,
  ply integer not null check (ply >= 1),
  uci text not null check (uci ~ '^[a-h][1-8][a-h][1-8][qrbn]?$'),
  san text not null,
  fen text not null,
  white_ms integer,
  black_ms integer,
  created_at timestamptz not null default now(),
  primary key (game_id, ply)
);

alter table public.moves enable row level security;
create policy "read moves of own games" on public.moves for select to authenticated
  using (exists (select 1 from public.games g where g.id = game_id and (select auth.uid()) in (g.white_id, g.black_id)));
revoke all on public.moves from anon, authenticated;
grant select on public.moves to authenticated;

-- Realtime pushes changes to both players (respecting the policies above).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.games, public.moves;
  end if;
end $$;
