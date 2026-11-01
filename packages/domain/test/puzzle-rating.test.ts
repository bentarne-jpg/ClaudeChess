import { describe, expect, it } from "vitest";
import { freshPuzzleProfile, newerRecord, puzzleRatingChange } from "../src/index.ts";

describe("puzzle rating", () => {
  it("gains about twice what it loses against an equal puzzle", () => {
    const p = { rating: 1500, games: 50 };
    expect(puzzleRatingChange(p, 1500, true)).toBe(10);
    expect(puzzleRatingChange(p, 1500, false)).toBe(-5);
  });
  it("moves faster for new players", () => {
    expect(puzzleRatingChange({ rating: 1500, games: 0 }, 1500, true)).toBe(24);
    expect(puzzleRatingChange({ rating: 1500, games: 20 }, 1500, true)).toBe(16);
  });
  it("rewards hard puzzles more and never gives less than the minimums", () => {
    const p = { rating: 1500, games: 50 };
    expect(puzzleRatingChange(p, 1900, true)).toBeGreaterThan(puzzleRatingChange(p, 1100, true));
    expect(puzzleRatingChange(p, 400, true)).toBe(3);
    expect(puzzleRatingChange(p, 3000, false)).toBe(-1);
  });
  it("starts a fresh profile at the given rating", () => {
    expect(freshPuzzleProfile(1200)).toMatchObject({ rating: 1200, best: 1200, hist: [1200], games: 0 });
  });
});

describe("newerRecord", () => {
  it("prefers the copy with more games, then the newest", () => {
    expect(newerRecord(null, { games: 1 })).toEqual({ games: 1 });
    expect(newerRecord({ games: 2 }, undefined)).toEqual({ games: 2 });
    expect(newerRecord({ games: 2 }, { games: 3 })).toEqual({ games: 3 });
    expect(newerRecord({ games: 3, updated: 5 }, { games: 3, updated: 9 })).toEqual({ games: 3, updated: 9 });
    expect(newerRecord({ games: 3, updated: 9 }, { games: 3, updated: 5 })).toEqual({ games: 3, updated: 9 });
  });
});
