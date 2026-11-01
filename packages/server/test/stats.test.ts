import { describe, expect, it } from "vitest";
import { buildStats, handleApi, isoWeek } from "../src/index.ts";
import { ALICE, BOB, memoryDeps } from "./fixtures.ts";

describe("isoWeek", () => {
  it("labels weeks the ISO way, Monday first", () => {
    expect(isoWeek(new Date(Date.UTC(2026, 10, 1)))).toEqual({ week: "2026-W44", start: Date.UTC(2026, 9, 26) }); // Sunday 1 Nov
    expect(isoWeek(new Date(Date.UTC(2026, 10, 2))).week).toBe("2026-W45");
    expect(isoWeek(new Date(Date.UTC(2027, 0, 1))).week).toBe("2026-W53");
  });
});

describe("buildStats", () => {
  const now = new Date(Date.UTC(2026, 10, 4, 12));
  const at = (days: number) => new Date(now.getTime() - days * 86400000);
  it("summarises ratings, puzzles, games and weekly activity", () => {
    const s = buildStats(
      [{ userId: ALICE, pool: "blitz", rating: 1540.4, rd: 80, vol: 0.06, games: 2, wins: 1, losses: 0, streak: 1, best: 1540.4, imported: false }],
      [ // newest first, as stored
        { userId: ALICE, puzzleId: "b", puzzleRating: 1300, solved: false, reason: "hint", ratingBefore: 1210, ratingAfter: 1204, createdAt: at(1) },
        { userId: ALICE, puzzleId: "a", puzzleRating: 1300, solved: true, reason: "løst", ratingBefore: 1200, ratingAfter: 1210, createdAt: at(9) },
      ],
      [
        { endedAt: at(8), kind: "pvp", pool: "blitz", result: "1/2-1/2", color: "b", ratingBefore: 1500, ratingAfter: 1501 },
        { endedAt: at(2), kind: "pvp", pool: "blitz", result: "1-0", color: "w", ratingBefore: 1501, ratingAfter: 1540 },
        { endedAt: at(1), kind: "bot", pool: "bot", result: "1-0", color: "b", ratingBefore: null, ratingAfter: null },
      ],
      now, 3);
    expect(s.ratings).toEqual([{ pool: "blitz", rating: 1540, best: 1540, games: 2, wins: 1, losses: 0, draws: 1 }]);
    expect(s.puzzles).toEqual({ attempts: 2, solved: 1, failed: 1, points: [{ t: at(9).getTime(), r: 1210 }, { t: at(1).getTime(), r: 1204 }] });
    expect(s.games).toMatchObject({ total: 3, wins: 1, draws: 1, losses: 1, bot: 1, pvp: 2 });
    expect(s.games.points.map((p) => p.r)).toEqual([1501, 1540]);
    expect(s.weeks.map((w) => w.week)).toEqual(["2026-W43", "2026-W44", "2026-W45"]);
    expect(s.weeks.at(-1)).toMatchObject({ puzzles: 1, solved: 0, games: 2, wins: 1 });
    expect(s.weeks[1]).toMatchObject({ puzzles: 1, solved: 1, games: 1, wins: 0 });
  });
  it("is empty for a new account", () => {
    const s = buildStats([], [], [], now);
    expect(s.weeks).toHaveLength(12);
    expect(s.games.total + s.puzzles.attempts).toBe(0);
  });
});

describe("account/stats route", () => {
  it("returns only the caller's activity", async () => {
    const { deps } = memoryDeps();
    await handleApi(deps, "puzzle/start", ALICE, { level: 1200 });
    await handleApi(deps, "puzzle/result", ALICE, { puzzleId: "t2", solved: false, moves: [] });
    await handleApi(deps, "bot-game/finish", BOB, { clientId: "x", pgn: "1. f3 e5 2. g4 Qh4#", color: "b", botRating: 1000, timeControl: null, reason: "checkmate" });
    const a = (await handleApi(deps, "account/stats", ALICE, {})).body as { puzzles: { attempts: number }; games: { total: number } };
    const b = (await handleApi(deps, "account/stats", BOB, {})).body as { puzzles: { attempts: number }; games: { total: number; wins: number } };
    expect([a.puzzles.attempts, a.games.total]).toEqual([1, 0]);
    expect([b.puzzles.attempts, b.games.total, b.games.wins]).toEqual([0, 1, 1]);
  });
});
