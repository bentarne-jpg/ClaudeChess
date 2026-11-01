import { describe, expect, it } from "vitest";
import { handleApi } from "../src/index.ts";
import { ALICE, BOB, memoryDeps } from "./fixtures.ts";

const CAROL = "33333333-3333-4333-8333-333333333333";

async function setup(tc: { m: number; i: number } | null = { m: 1, i: 0 }, color = "w") {
  const m = memoryDeps();
  m.store.state.names = { [ALICE]: "Alice", [BOB]: "Bob" };
  const call = async (user: string, route: string, body: unknown) => {
    const r = await handleApi(m.deps, route, user, body);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- replies are checked field by field below
    return r as { status: number; body: any };
  };
  const created = await call(ALICE, "pvp/create", { timeControl: tc, color, rated: true });
  const code = created.body.inviteCode as string, id = created.body.id as string;
  return { ...m, call, code, id };
}

describe("challenges", () => {
  it("creates an open challenge that only the creator sees the link of", async () => {
    const t = await setup();
    const info = await t.call(BOB, "pvp/info", { code: t.code });
    expect(info.body).toMatchObject({ from: "Alice", status: "open", yours: false, rated: true });
    expect((await t.call(BOB, "pvp/state", { gameId: t.id })).status).toBe(404);
  });

  it("starts the game when someone accepts, once", async () => {
    const t = await setup();
    expect((await t.call(ALICE, "pvp/accept", { code: t.code })).status).toBe(409);
    const s = await t.call(BOB, "pvp/accept", { code: t.code });
    expect(s.body).toMatchObject({ status: "active", you: "b", white: { name: "Alice" }, black: { name: "Bob" }, clock: { w: 60000, b: 60000, running: null } });
    expect((await t.call(CAROL, "pvp/accept", { code: t.code })).status).toBe(404); // the code is used up
  });
});

describe("moves and clocks", () => {
  it("accepts only legal moves, in turn, in order", async () => {
    const t = await setup(); await t.call(BOB, "pvp/accept", { code: t.code });
    expect((await t.call(BOB, "pvp/move", { gameId: t.id, uci: "e7e5", ply: 1 })).body.error).toBe("not-your-turn");
    expect((await t.call(ALICE, "pvp/move", { gameId: t.id, uci: "e2e5", ply: 1 })).body.error).toBe("illegal-move");
    expect((await t.call(ALICE, "pvp/move", { gameId: t.id, uci: "e2e4", ply: 2 })).status).toBe(409);
    const s = await t.call(ALICE, "pvp/move", { gameId: t.id, uci: "e2e4", ply: 1 });
    expect(s.body).toMatchObject({ ply: 1, moves: [{ san: "e4" }] });
    expect((await t.call(CAROL, "pvp/move", { gameId: t.id, uci: "e7e5", ply: 2 })).status).toBe(404);
  });

  it("runs the clock on server time and lets the opponent claim a timeout", async () => {
    const t = await setup({ m: 1, i: 2 }); await t.call(BOB, "pvp/accept", { code: t.code });
    await t.call(ALICE, "pvp/move", { gameId: t.id, uci: "e2e4", ply: 1 });
    await t.call(BOB, "pvp/move", { gameId: t.id, uci: "e7e5", ply: 2 });
    t.clock.advance(10_000);
    const s = await t.call(ALICE, "pvp/move", { gameId: t.id, uci: "g1f3", ply: 3 });
    expect(s.body.clock).toMatchObject({ w: 52_000, b: 60_000, running: "b" });
    expect((await t.call(ALICE, "pvp/claim-timeout", { gameId: t.id })).status).toBe(409);
    t.clock.advance(61_000);
    expect((await t.call(BOB, "pvp/move", { gameId: t.id, uci: "b8c6", ply: 4 })).body).toMatchObject({ status: "finished", result: "1-0", reason: "timeout" });
  });

  it("ends by checkmate, stores the PGN and rates both players", async () => {
    const t = await setup(null); await t.call(BOB, "pvp/accept", { code: t.code });
    const plies = ["f2f3", "e7e5", "g2g4", "d8h4"];
    let s;
    for (let i = 0; i < plies.length; i++) s = await t.call(i % 2 ? BOB : ALICE, "pvp/move", { gameId: t.id, uci: plies[i], ply: i + 1 });
    expect(s!.body).toMatchObject({ status: "finished", result: "0-1", reason: "checkmate", ratingChange: { w: { pool: "classical" }, b: { pool: "classical" } } });
    expect(s!.body.ratingChange.b.after).toBeGreaterThan(1500);
    const g = t.store.state.games[0]!;
    expect(g.pgn).toContain("2. g4 Qh4# 0-1");
    expect(t.store.state.ratings.map((r) => [r.userId, r.pool, r.games])).toEqual([[ALICE, "classical", 1], [BOB, "classical", 1]]);
    expect((await t.call(ALICE, "pvp/move", { gameId: t.id, uci: "a2a3", ply: 5 })).body.error).toBe("game-over");
  });
});

describe("resign, draw, abort", () => {
  it("resigns", async () => {
    const t = await setup(); await t.call(BOB, "pvp/accept", { code: t.code });
    expect((await t.call(BOB, "pvp/resign", { gameId: t.id })).body).toMatchObject({ result: "1-0", reason: "resign", ratingChange: null });
    const u = await setup(); await u.call(BOB, "pvp/accept", { code: u.code });
    await u.call(ALICE, "pvp/move", { gameId: u.id, uci: "e2e4", ply: 1 }); await u.call(BOB, "pvp/move", { gameId: u.id, uci: "e7e5", ply: 2 });
    await u.call(BOB, "pvp/resign", { gameId: u.id });
    expect((await u.call(ALICE, "pvp/state", { gameId: u.id })).body.ratingChange.w).toMatchObject({ pool: "bullet", before: 1500 });
  });
  it("offers, declines and accepts draws", async () => {
    const t = await setup(); await t.call(BOB, "pvp/accept", { code: t.code });
    expect((await t.call(BOB, "pvp/draw", { gameId: t.id, action: "accept" })).status).toBe(409);
    await t.call(ALICE, "pvp/draw", { gameId: t.id, action: "offer" });
    expect((await t.call(BOB, "pvp/draw", { gameId: t.id, action: "decline" })).body.drawOffer).toBeNull();
    await t.call(ALICE, "pvp/draw", { gameId: t.id, action: "offer" });
    expect((await t.call(BOB, "pvp/draw", { gameId: t.id, action: "accept" })).body).toMatchObject({ result: "1/2-1/2", reason: "agreement" });
  });
  it("aborts before both have moved, not after", async () => {
    const t = await setup(); await t.call(BOB, "pvp/accept", { code: t.code });
    await t.call(ALICE, "pvp/move", { gameId: t.id, uci: "e2e4", ply: 1 });
    expect((await t.call(BOB, "pvp/abort", { gameId: t.id })).body.status).toBe("aborted");
    const u = await setup(); await u.call(BOB, "pvp/accept", { code: u.code });
    await u.call(ALICE, "pvp/move", { gameId: u.id, uci: "e2e4", ply: 1 });
    await u.call(BOB, "pvp/move", { gameId: u.id, uci: "e7e5", ply: 2 });
    expect((await u.call(ALICE, "pvp/abort", { gameId: u.id })).status).toBe(409);
  });
  it("lists my open and running games", async () => {
    const t = await setup(); 
    expect((await t.call(ALICE, "pvp/list", {})).body.games).toMatchObject([{ status: "open", inviteCode: t.code }]);
    await t.call(BOB, "pvp/accept", { code: t.code });
    expect((await t.call(BOB, "pvp/list", {})).body.games).toMatchObject([{ status: "active", you: "b", opponent: "Alice" }]);
  });
});
