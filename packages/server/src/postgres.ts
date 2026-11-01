/*
 * Postgres adapter (used by the Edge Function with the service role connection, and by the contract
 * tests against a real database). Works in Node and Deno with the `postgres` driver.
 */
import postgres from "postgres";
import type { Pool } from "@sjakk/domain";
import type { GamePlayer, GameRow, MoveRow, PuzzleAttempt, RatingRow, Repos, Store } from "./ports.ts";

type Sql = postgres.Sql | postgres.TransactionSql;

const toRating = (r: postgres.Row): RatingRow => ({
  userId: r.user_id, pool: r.pool as Pool, rating: r.rating, rd: r.rd, vol: r.vol, games: r.games, wins: r.wins,
  losses: r.losses, streak: r.streak, best: r.best, imported: r.imported,
});
const toAttempt = (r: postgres.Row): PuzzleAttempt => ({
  userId: r.user_id, puzzleId: r.puzzle_id, puzzleRating: r.puzzle_rating, solved: r.solved, reason: r.reason,
  ratingBefore: r.rating_before, ratingAfter: r.rating_after, createdAt: r.created_at,
});
const toGame = (r: postgres.Row): GameRow & { id: string } => ({
  id: r.id, kind: r.kind, status: r.status, rated: r.rated, timeControl: r.time_control, pool: r.pool,
  whiteId: r.white_id, blackId: r.black_id, botRating: r.bot_rating, createdBy: r.created_by, clientId: r.client_id,
  startFen: r.start_fen, result: r.result, reason: r.reason, pgn: r.pgn, startedAt: r.started_at, endedAt: r.ended_at,
  inviteCode: r.invite_code, creatorColor: r.creator_color, fen: r.fen, ply: r.ply, clock: r.clock, drawOffer: r.draw_offer,
});
const COLUMNS: Record<string, string> = {
  status: "status", whiteId: "white_id", blackId: "black_id", result: "result", reason: "reason", pgn: "pgn", startedAt: "started_at",
  endedAt: "ended_at", inviteCode: "invite_code", fen: "fen", ply: "ply", clock: "clock", drawOffer: "draw_offer",
};

export function repos(sql: Sql): Repos {
  return {
    ratings: {
      async get(u, p) { const [r] = await sql`select * from public.ratings where user_id = ${u} and pool = ${p}`; return r ? toRating(r) : null; },
      async put(x) {
        await sql`insert into public.ratings (user_id, pool, rating, rd, vol, games, wins, losses, streak, best, imported, updated_at)
          values (${x.userId}, ${x.pool}, ${x.rating}, ${x.rd}, ${x.vol}, ${x.games}, ${x.wins}, ${x.losses}, ${x.streak}, ${x.best}, ${x.imported}, now())
          on conflict (user_id, pool) do update set rating = excluded.rating, rd = excluded.rd, vol = excluded.vol, games = excluded.games,
            wins = excluded.wins, losses = excluded.losses, streak = excluded.streak, best = excluded.best, imported = excluded.imported, updated_at = now()`;
      },
      async remove(u, p) { await sql`delete from public.ratings where user_id = ${u} and pool = ${p}`; },
    },
    puzzleAttempts: {
      async has(u, id) { const [r] = await sql`select 1 from public.puzzle_attempts where user_id = ${u} and puzzle_id = ${id}`; return !!r; },
      async add(a) {
        await sql`insert into public.puzzle_attempts (user_id, puzzle_id, puzzle_rating, solved, reason, rating_before, rating_after, created_at)
          values (${a.userId}, ${a.puzzleId}, ${a.puzzleRating}, ${a.solved}, ${a.reason}, ${a.ratingBefore}, ${a.ratingAfter}, ${a.createdAt})`;
      },
      async recent(u, limit) {
        return (await sql`select * from public.puzzle_attempts where user_id = ${u} order by created_at desc, id desc limit ${limit}`).map(toAttempt);
      },
      async countSince(u, since) { const [r] = await sql`select count(*)::int as n from public.puzzle_attempts where user_id = ${u} and created_at >= ${since}`; return r!.n; },
      async removeAll(u) { await sql`delete from public.puzzle_attempts where user_id = ${u}`; },
    },
    games: {
      async insert(g) {
        const [r] = await sql`insert into public.games (kind, status, rated, time_control, pool, white_id, black_id, bot_rating, created_by,
            client_id, start_fen, result, reason, pgn, started_at, ended_at, invite_code, creator_color, fen, ply, clock, draw_offer)
          values (${g.kind}, ${g.status}, ${g.rated}, ${g.timeControl ? sql.json(g.timeControl) : null}, ${g.pool}, ${g.whiteId}, ${g.blackId},
            ${g.botRating}, ${g.createdBy}, ${g.clientId}, ${g.startFen}, ${g.result}, ${g.reason}, ${g.pgn}, ${g.startedAt}, ${g.endedAt},
            ${g.inviteCode ?? null}, ${g.creatorColor ?? null}, ${g.fen ?? null}, ${g.ply ?? 0}, ${g.clock ? sql.json(g.clock as never) : null}, ${g.drawOffer ?? null})
          returning id`;
        return r!.id;
      },
      async byClientId(u, c) { const [r] = await sql`select * from public.games where created_by = ${u} and client_id = ${c}`; return r ? toGame(r) : null; },
      async addPlayer(p: GamePlayer) {
        await sql`insert into public.game_players (game_id, user_id, color, rating_before, rating_after)
          values (${p.gameId}, ${p.userId}, ${p.color}, ${p.ratingBefore}, ${p.ratingAfter})`;
      },
      async get(id, lock) {
        const [r] = lock ? await sql`select * from public.games where id = ${id} for update` : await sql`select * from public.games where id = ${id}`;
        return r ? toGame(r) : null;
      },
      async byCode(code) { const [r] = await sql`select * from public.games where invite_code = ${code}`; return r ? toGame(r) : null; },
      async update(id, patch) {
        const row: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch)) {
          const col = COLUMNS[k]; if (!col) throw new Error(`games.update: ${k} cannot be changed`);
          row[col] = k === "clock" && v ? sql.json(v as never) : v ?? null;
        }
        if (Object.keys(row).length) await sql`update public.games set ${sql(row as never)} where id = ${id}`;
      },
      async names(ids) {
        if (!ids.length) return {};
        const rows = await sql`select id, display_name from public.profiles where id = any(${ids}::uuid[])`;
        return Object.fromEntries(rows.map((r) => [r.id, r.display_name]));
      },
      async activeFor(u) {
        const rows = await sql`select g.*, p.display_name as opponent from public.games g
          left join public.profiles p on p.id = case when g.white_id = ${u} then g.black_id else g.white_id end
          where g.kind = 'pvp' and ${u} in (g.white_id, g.black_id) and (g.status = 'active' or (g.status = 'open' and g.created_by = ${u}))
          order by g.created_at desc limit 50`;
        return rows.map((r) => ({ id: r.id, status: r.status, you: r.white_id === u ? "w" as const : "b" as const, opponent: r.opponent ?? null,
          timeControl: r.time_control, inviteCode: r.status === "open" ? r.invite_code : null }));
      },
      async players(id) {
        return (await sql`select * from public.game_players where game_id = ${id} order by color desc`).map((r) => ({
          gameId: r.game_id, userId: r.user_id, color: r.color, ratingBefore: r.rating_before, ratingAfter: r.rating_after,
        }));
      },
    },
    moves: {
      async add(m: MoveRow) {
        await sql`insert into public.moves (game_id, ply, uci, san, fen, white_ms, black_ms, created_at)
          values (${m.gameId}, ${m.ply}, ${m.uci}, ${m.san}, ${m.fen}, ${m.whiteMs}, ${m.blackMs}, ${m.createdAt})`;
      },
      async list(id) {
        return (await sql`select * from public.moves where game_id = ${id} order by ply`).map((r) => ({
          gameId: r.game_id, ply: r.ply, uci: r.uci, san: r.san, fen: r.fen, whiteMs: r.white_ms, blackMs: r.black_ms, createdAt: r.created_at,
        }));
      },
    },
    account: {
      async exportAll(u) {
        const [profile] = await sql`select display_name, created_at from public.profiles where id = ${u}`;
        return {
          profile: profile ?? null,
          ratings: (await sql`select * from public.ratings where user_id = ${u}`).map(toRating),
          puzzleAttempts: (await sql`select * from public.puzzle_attempts where user_id = ${u} order by created_at`).map(toAttempt),
          games: (await sql`select * from public.games where ${u} in (white_id, black_id) order by created_at`).map(toGame),
          documents: await sql`select name, data, updated_at from public.user_docs where user_id = ${u}`,
        };
      },
    },
  };
}

export function postgresStore(sql: postgres.Sql): Store {
  return { tx: (fn) => sql.begin((t) => fn(repos(t))) as never };
}

export { postgres };
