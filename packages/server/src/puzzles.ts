import { Chess } from "chess.js";
import { freshPuzzleProfile, puzzleRatingChange } from "@sjakk/domain";
import type { Body, PuzzleProfile } from "@sjakk/contracts";
import { ApiError } from "./errors.ts";
import type { Deps, Repos, RatingRow } from "./ports.ts";

const MAX_PER_MINUTE = 30;

/** The puzzle profile the app shows, built from the stored rating and the latest attempts. */
export async function puzzleProfile(r: Repos, userId: string): Promise<PuzzleProfile | null> {
  const row = await r.ratings.get(userId, "puzzle");
  if (!row) return null;
  const recent = await r.puzzleAttempts.recent(userId, 600);
  const hist = recent.slice(0, 99).map((a) => Math.round(a.ratingAfter)).reverse();
  const first = recent[Math.min(98, recent.length - 1)];
  hist.unshift(Math.round(first ? first.ratingBefore : row.rating));
  return {
    rating: Math.round(row.rating), games: row.games, solved: row.wins, failed: row.losses, streak: row.streak,
    best: Math.round(row.best), hist, seen: recent.map((a) => a.puzzleId).reverse(),
    log: recent.slice(0, 12).reverse().map((a) => ({
      r: a.puzzleRating, d: Math.round(a.ratingAfter - a.ratingBefore), win: a.solved, why: a.reason ?? (a.solved ? "løst" : "ikke løst"),
    })),
    updated: (recent[0]?.createdAt ?? new Date(0)).getTime(),
  };
}

const newPuzzleRow = (userId: string, rating: number): RatingRow => ({
  userId, pool: "puzzle", rating, rd: 0, vol: 0, games: 0, wins: 0, losses: 0, streak: 0, best: rating, imported: false,
});

export function startPuzzles(d: Deps, userId: string, b: Body<"puzzle/start">) {
  return d.store.tx(async (r) => {
    const row = await r.ratings.get(userId, "puzzle");
    if (row && row.games > 0) throw new ApiError("conflict", "Puzzle rating already started");
    await r.ratings.put(newPuzzleRow(userId, freshPuzzleProfile(b.level).rating));
    return { profile: (await puzzleProfile(r, userId))! };
  });
}

export function resetPuzzles(d: Deps, userId: string) {
  return d.store.tx(async (r) => {
    await r.puzzleAttempts.removeAll(userId);
    await r.ratings.remove(userId, "puzzle");
    return { profile: null };
  });
}

/** True when the player's moves solve the puzzle (the first solution move is the opponent's). */
export function solves(p: { fen: string; moves: string[] }, played: string[]): boolean {
  const c = new Chess(p.fen);
  const apply = (u: string) => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  if (!p.moves[0] || !apply(p.moves[0])) return false;
  let step = 1;
  for (const u of played) {
    const exp = p.moves[step];
    if (!exp) return false;
    const ok = u === exp || (u === exp.slice(0, 4) && !exp[4]);
    if (!apply(u)) return false;
    if (c.in_checkmate()) return true;
    if (!ok) return false;
    step++;
    if (step >= p.moves.length) return true;
    if (!apply(p.moves[step]!)) return false;
    step++;
    if (step >= p.moves.length) return true;
  }
  return false;
}

export function recordPuzzleResult(d: Deps, userId: string, b: Body<"puzzle/result">) {
  const puzzle = d.puzzles.get(b.puzzleId);
  if (!puzzle) throw new ApiError("not-found", "Unknown puzzle");
  if (b.solved && !solves(puzzle, b.moves)) throw new ApiError("not-solved");
  return d.store.tx(async (r) => {
    const row = await r.ratings.get(userId, "puzzle");
    if (!row) throw new ApiError("no-profile");
    const minuteAgo = new Date(d.clock.now().getTime() - 60_000);
    if ((await r.puzzleAttempts.countSince(userId, minuteAgo)) >= MAX_PER_MINUTE) throw new ApiError("rate-limited");
    if (await r.puzzleAttempts.has(userId, puzzle.id)) return { profile: (await puzzleProfile(r, userId))!, delta: 0, rated: false };
    const delta = puzzleRatingChange(row, puzzle.rating, b.solved);
    const after = Math.max(100, row.rating + delta);
    await r.ratings.put({
      ...row, rating: after, games: row.games + 1,
      wins: row.wins + (b.solved ? 1 : 0), losses: row.losses + (b.solved ? 0 : 1),
      streak: b.solved ? row.streak + 1 : 0, best: Math.max(row.best, after),
    });
    await r.puzzleAttempts.add({
      userId, puzzleId: puzzle.id, puzzleRating: puzzle.rating, solved: b.solved,
      reason: b.reason ?? (b.solved ? "løst" : "ikke løst"), ratingBefore: row.rating, ratingAfter: after, createdAt: d.clock.now(),
    });
    return { profile: (await puzzleProfile(r, userId))!, delta: after - row.rating, rated: true };
  });
}

export function getPuzzleProfile(d: Deps, userId: string) {
  return d.store.tx(async (r) => ({ profile: await puzzleProfile(r, userId) }));
}
