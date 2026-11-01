/** A player's puzzle record. */
export interface PuzzleProfile {
  rating: number; games: number; solved: number; failed: number; streak: number; best: number;
  hist: number[]; seen: string[]; updated?: number; log?: unknown[];
}

/**
 * Gains use the full factor and losses half of it, so progress goes faster forwards than backwards
 * (the owner's rule: a solve gains about twice what a miss loses).
 */
export const PUZZLE_GAIN = 1.0;
export const PUZZLE_LOSS = 0.5;

export const freshPuzzleProfile = (rating: number): PuzzleProfile =>
  ({ rating, games: 0, solved: 0, failed: 0, streak: 0, best: rating, hist: [rating], seen: [] });

/**
 * Elo-style change: solving a hard puzzle gives more than an easy one, failing an easy puzzle costs
 * more than a hard one. New players move faster (higher K).
 */
export function puzzleRatingChange(profile: Pick<PuzzleProfile, "rating" | "games">, puzzleRating: number, solved: boolean): number {
  const K = profile.games < 10 ? 48 : profile.games < 30 ? 32 : 20;
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - profile.rating) / 400));
  return solved
    ? Math.max(3, Math.round(K * PUZZLE_GAIN * (1 - expected)))
    : -Math.max(1, Math.round(K * PUZZLE_LOSS * expected));
}

/** Choose between two copies of a record (e.g. local and account): most played wins, then newest. */
export function newerRecord<T extends { games?: number; updated?: number }>(a: T | null | undefined, b: T | null | undefined): T | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const ga = a.games ?? -1, gb = b.games ?? -1;
  if (ga !== gb) return gb > ga ? b : a;
  return (b.updated ?? 0) > (a.updated ?? 0) ? b : a;
}
