import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import type { Deps, PuzzleSource } from "../src/index.ts";
import { memoryStore } from "../src/index.ts";

export const ALICE = "11111111-1111-4111-8111-111111111111";
export const BOB = "22222222-2222-4222-8222-222222222222";

/** Lichess-style puzzle: the first move is the opponent's; the player answers with Qxf7#. */
export const PUZZLE = { id: "t1", fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4", moves: [], rating: 1500 } as {
  id: string; fen: string; moves: string[]; rating: number };
// Black to move after 1.e4 e5 2.Bc4 Nc6 3.Qh5 — opponent plays ...Nf6?? and we mate.
PUZZLE.fen = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3";
PUZZLE.moves = ["g8f6", "h5f7"];
export const LONG = { id: "t2", rating: 1200, fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1", moves: ["g8f8", "a1a8"] };

export const puzzles: PuzzleSource = { get: (id) => [PUZZLE, LONG].find((p) => p.id === id) ?? null };

export function fakeClock(start = Date.UTC(2026, 10, 1)) {
  let t = start;
  return { now: () => new Date(t), advance: (ms: number) => { t += ms; } };
}

export function memoryDeps() {
  const store = memoryStore(), clock = fakeClock(), deleted: string[] = [];
  let code = 0;
  const deps: Deps = { store, puzzles, clock, auth: { async deleteUser(id) { deleted.push(id); } }, inviteCode: () => `code${String(++code).padStart(6, "0")}` };
  return { deps, store, clock, deleted };
}

/** A fresh database with the auth stand-in and all migrations, or null when no DATABASE_URL is set. */
export async function freshDatabase(): Promise<{ sql: postgres.Sql; url: string; drop: () => Promise<void> } | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  const name = `t_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  await admin.unsafe(`create database ${name}`);
  const u = new URL(url); u.pathname = `/${name}`;
  const sql = postgres(u.toString(), { max: 4, onnotice: () => {} });
  const root = resolve(import.meta.dirname, "../../../supabase");
  await sql.unsafe(readFileSync(resolve(import.meta.dirname, "auth_stub.sql"), "utf8"));
  for (const f of readdirSync(`${root}/migrations`).sort()) await sql.unsafe(readFileSync(`${root}/migrations/${f}`, "utf8"));
  await sql.unsafe("grant all on all tables in schema public to service_role; grant usage on all sequences in schema public to service_role;");
  for (const id of [ALICE, BOB]) await sql`insert into auth.users (id, raw_user_meta_data) values (${id}, ${sql.json({ full_name: id === ALICE ? "Alice" : "Bob" })})`;
  return { sql, url: u.toString(), drop: async () => { await sql.end(); await admin.unsafe(`drop database ${name}`); await admin.end(); } };
}
