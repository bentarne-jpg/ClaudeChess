import { describe, expect, it } from "vitest";
import { handleApi, solves } from "../src/index.ts";
import { ALICE, LONG, memoryDeps, PUZZLE } from "./fixtures.ts";

const call = (d: ReturnType<typeof memoryDeps>["deps"], route: string, body: unknown, user: string | null = ALICE) =>
  handleApi(d, route, user, body);

describe("api boundary", () => {
  it("rejects unknown routes, missing login and invalid bodies", async () => {
    const { deps } = memoryDeps();
    expect((await call(deps, "nope", {})).status).toBe(404);
    expect((await call(deps, "puzzle/profile", {}, null)).status).toBe(401);
    expect(await call(deps, "puzzle/start", { level: 999 })).toMatchObject({ status: 400, body: { error: "bad-request" } });
    expect((await call(deps, "puzzle/start", { level: 800, extra: 1 })).status).toBe(400);
  });
});

describe("puzzles", () => {
  it("needs a starting level before results count", async () => {
    const { deps } = memoryDeps();
    expect(await call(deps, "puzzle/result", { puzzleId: "t1", solved: false, moves: [] })).toMatchObject({ status: 409, body: { error: "no-profile" } });
    expect((await call(deps, "puzzle/profile", {})).body).toEqual({ profile: null });
    const r = await call(deps, "puzzle/start", { level: 1200 });
    expect(r.body).toMatchObject({ profile: { rating: 1200, games: 0, hist: [1200], seen: [] } });
  });

  it("checks solutions on the server and rates each puzzle once", async () => {
    const { deps } = memoryDeps();
    await call(deps, "puzzle/start", { level: 1200 });
    expect(await call(deps, "puzzle/result", { puzzleId: "t1", solved: true, moves: ["h5h7"] })).toMatchObject({ status: 400, body: { error: "not-solved" } });
    const ok = await call(deps, "puzzle/result", { puzzleId: "t1", solved: true, moves: ["h5f7"] });
    expect(ok).toMatchObject({ status: 200, body: { rated: true, profile: { games: 1, solved: 1, streak: 1, seen: ["t1"] } } });
    const gained = (ok.body as { delta: number }).delta;
    expect(gained).toBe(Math.round(48 * (1 - 1 / (1 + 10 ** ((1500 - 1200) / 400))))); // new player: K = 48
    const again = await call(deps, "puzzle/result", { puzzleId: "t1", solved: true, moves: ["h5f7"] });
    expect(again.body).toMatchObject({ rated: false, delta: 0, profile: { games: 1 } });
  });

  it("records misses with half-weight losses and resets the streak", async () => {
    const { deps } = memoryDeps();
    await call(deps, "puzzle/start", { level: 1200 });
    await call(deps, "puzzle/result", { puzzleId: "t1", solved: true, moves: ["h5f7"] });
    const r = await call(deps, "puzzle/result", { puzzleId: "t2", solved: false, moves: [], reason: "hint" });
    expect(r.body).toMatchObject({ rated: true, profile: { games: 2, failed: 1, streak: 0 } });
    expect((r.body as { delta: number }).delta).toBeLessThan(0);
    expect((r.body as { profile: { log: { why: string }[] } }).profile.log.at(-1)!.why).toBe("hint");
  });

  it("limits how fast results can be sent", async () => {
    const { deps, store } = memoryDeps();
    await call(deps, "puzzle/start", { level: 1200 });
    for (let i = 0; i < 30; i++) store.state.attempts.push({ userId: ALICE, puzzleId: `x${i}`, puzzleRating: 1200, solved: false, reason: null, ratingBefore: 1200, ratingAfter: 1200, createdAt: deps.clock.now() });
    expect((await call(deps, "puzzle/result", { puzzleId: "t1", solved: false, moves: [] })).status).toBe(429);
  });

  it("does not restart a rating that has games, but can reset it", async () => {
    const { deps } = memoryDeps();
    await call(deps, "puzzle/start", { level: 800 });
    await call(deps, "puzzle/result", { puzzleId: "t2", solved: false, moves: [] });
    expect((await call(deps, "puzzle/start", { level: 2000 })).status).toBe(409);
    await call(deps, "puzzle/reset", {});
    expect((await call(deps, "puzzle/profile", {})).body).toEqual({ profile: null });
    expect((await call(deps, "puzzle/start", { level: 2000 })).body).toMatchObject({ profile: { rating: 2000 } });
  });

  it("knows when moves solve a puzzle", () => {
    expect(solves(PUZZLE, ["h5f7"])).toBe(true);
    expect(solves(PUZZLE, [])).toBe(false);
    expect(solves(LONG, ["a1a8"])).toBe(true);
    expect(solves(LONG, ["a1a2"])).toBe(false);
    expect(solves({ ...PUZZLE, moves: ["a1a1"] }, ["h5f7"])).toBe(false);
  });
});

describe("bot games", () => {
  const mate = { clientId: "b_1", pgn: "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#", color: "w", botRating: 1400, timeControl: { m: 5, i: 0 }, reason: "checkmate" };

  it("stores a won game and raises the bot rating", async () => {
    const { deps, store } = memoryDeps();
    const r = await call(deps, "bot-game/finish", mate);
    expect(r).toMatchObject({ status: 200, body: { result: "1-0", rated: true, rating: { pool: "bot", before: 1500 } } });
    expect((r.body as { rating: { after: number } }).rating.after).toBeGreaterThan(1500);
    expect(store.state.games[0]).toMatchObject({ kind: "bot", whiteId: ALICE, blackId: null, botRating: 1400 });
  });

  it("refuses endings that do not match the moves, and duplicates", async () => {
    const { deps } = memoryDeps();
    expect((await call(deps, "bot-game/finish", { ...mate, pgn: "1. e4 e5", reason: "checkmate" })).status).toBe(400);
    expect((await call(deps, "bot-game/finish", { ...mate, pgn: "1. e4 e5 2. Ke3" })).status).toBe(400);
    expect((await call(deps, "bot-game/finish", { ...mate, reason: "draw" })).status).toBe(400);
    expect((await call(deps, "bot-game/finish", { ...mate, reason: "resign" })).status).toBe(400);
    expect((await call(deps, "bot-game/finish", mate)).status).toBe(200);
    expect((await call(deps, "bot-game/finish", mate)).status).toBe(409);
  });

  it("counts resignations and timeouts against the right side", async () => {
    const { deps } = memoryDeps();
    const res = await call(deps, "bot-game/finish", { ...mate, clientId: "b_2", pgn: "1. e4 e5 2. Nf3", reason: "resign" });
    expect(res.body).toMatchObject({ result: "0-1" });
    const to = await call(deps, "bot-game/finish", { ...mate, clientId: "b_3", color: "b", pgn: "1. e4 e5 2. Nf3", reason: "timeout", flagged: "w" });
    expect(to.body).toMatchObject({ result: "0-1" });
    expect((await call(deps, "bot-game/finish", { ...mate, clientId: "b_4", pgn: "1. e4", reason: "timeout" })).status).toBe(400);
    const bare = await call(deps, "bot-game/finish", { ...mate, clientId: "b_6", pgn: '[FEN "8/8/8/4k3/8/8/2Q5/K7 b - - 0 1"]\n1... Kd5 2. Qc4+', reason: "timeout", flagged: "w" });
    expect(bare.body).toMatchObject({ result: "1/2-1/2" }); // Black has only a king: White's flag is a draw
  });

  it("does not rate a game with fewer than two moves", async () => {
    const { deps } = memoryDeps();
    const r = await call(deps, "bot-game/finish", { ...mate, clientId: "b_5", pgn: "1. e4", reason: "resign" });
    expect(r.body).toMatchObject({ rated: false, rating: null });
  });
});

describe("account", () => {
  it("imports a local puzzle rating once, clamped", async () => {
    const { deps } = memoryDeps();
    const r = await call(deps, "account/import", { puzzle: { rating: 3900, games: 40, solved: 30, failed: 10, best: 3950 } });
    expect(r.body).toMatchObject({ profile: { rating: 3000, games: 40, solved: 30, failed: 10, best: 3000 } });
    expect((await call(deps, "account/import", { puzzle: { rating: 1000, games: 1, solved: 1, failed: 0, best: 1000 } })).status).toBe(409);
  });

  it("exports the user's data and deletes the login", async () => {
    const { deps, deleted } = memoryDeps();
    await call(deps, "puzzle/start", { level: 1200 });
    const ex = await call(deps, "account/export", {});
    expect(ex.body).toMatchObject({ ratings: [{ pool: "puzzle", rating: 1200 }] });
    expect((await call(deps, "account/delete", {})).status).toBe(400);
    expect((await call(deps, "account/delete", { confirm: "SLETT" })).body).toEqual({ deleted: true });
    expect(deleted).toEqual([ALICE]);
  });
});
