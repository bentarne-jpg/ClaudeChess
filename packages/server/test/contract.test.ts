/*
 * One contract suite for the repositories, run against the in-memory fake and real Postgres
 * (manifest T3), so the fake used by the use-case tests cannot drift from the database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memoryStore, type Store } from "../src/index.ts";
import { postgresStore } from "../src/postgres.ts";
import { ALICE, BOB, freshDatabase } from "./fixtures.ts";

const db = await freshDatabase();
const stores: [string, () => Store][] = [["memory", () => memoryStore()]];
if (db) stores.push(["postgres", () => postgresStore(db.sql)]);
afterAll(async () => { await db?.drop(); });

describe.each(stores)("repositories (%s)", (_name, make) => {
  let store: Store;
  beforeAll(async () => {
    store = make();
    if (db) await db.sql`truncate public.ratings, public.puzzle_attempts, public.games, public.game_players cascade`;
  });

  it("stores and replaces ratings per pool", async () => {
    const row = { userId: ALICE, pool: "puzzle" as const, rating: 1200, rd: 0, vol: 0, games: 0, wins: 0, losses: 0, streak: 0, best: 1200, imported: false };
    await store.tx(async (r) => { await r.ratings.put(row); await r.ratings.put({ ...row, rating: 1210, games: 1 }); });
    await store.tx(async (r) => {
      expect(await r.ratings.get(ALICE, "puzzle")).toMatchObject({ rating: 1210, games: 1 });
      expect(await r.ratings.get(ALICE, "bot")).toBeNull();
      expect(await r.ratings.get(BOB, "puzzle")).toBeNull();
    });
  });

  it("keeps puzzle attempts unique and newest first", async () => {
    const at = (id: string, ms: number) => ({ userId: ALICE, puzzleId: id, puzzleRating: 1300, solved: true, reason: "løst", ratingBefore: 1200, ratingAfter: 1210, createdAt: new Date(ms) });
    await store.tx(async (r) => { await r.puzzleAttempts.add(at("a", 1000)); await r.puzzleAttempts.add(at("b", 2000)); });
    await expect(store.tx((r) => r.puzzleAttempts.add(at("a", 3000)))).rejects.toThrow();
    await store.tx(async (r) => {
      expect((await r.puzzleAttempts.recent(ALICE, 10)).map((a) => a.puzzleId)).toEqual(["b", "a"]);
      expect(await r.puzzleAttempts.has(ALICE, "a")).toBe(true);
      expect(await r.puzzleAttempts.countSince(ALICE, new Date(1500))).toBe(1);
    });
  });

  it("rolls back everything when a transaction fails", async () => {
    await expect(store.tx(async (r) => {
      await r.ratings.put({ userId: BOB, pool: "bot", rating: 1500, rd: 350, vol: 0.06, games: 0, wins: 0, losses: 0, streak: 0, best: 1500, imported: false });
      throw new Error("boom");
    })).rejects.toThrow("boom");
    await store.tx(async (r) => expect(await r.ratings.get(BOB, "bot")).toBeNull());
  });

  it("stores games with players and finds them by client id", async () => {
    const id = await store.tx((r) => r.games.insert({
      kind: "bot", status: "finished", rated: true, timeControl: { m: 3, i: 2 }, pool: "bot", whiteId: ALICE, blackId: null, botRating: 1400,
      createdBy: ALICE, clientId: "c1", startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", result: "1-0", reason: "checkmate",
      pgn: "1. e4", startedAt: null, endedAt: new Date(5000),
    }));
    await store.tx((r) => r.games.addPlayer({ gameId: id, userId: ALICE, color: "w", ratingBefore: 1500, ratingAfter: 1600 }));
    await store.tx(async (r) => {
      expect(await r.games.byClientId(ALICE, "c1")).toMatchObject({ id, timeControl: { m: 3, i: 2 }, result: "1-0" });
      expect(await r.games.byClientId(BOB, "c1")).toBeNull();
      expect(await r.games.players(id)).toEqual([{ gameId: id, userId: ALICE, color: "w", ratingBefore: 1500, ratingAfter: 1600 }]);
      const ex = await r.account.exportAll(ALICE);
      expect((ex.games as unknown[]).length).toBe(1);
    });
  });
});
