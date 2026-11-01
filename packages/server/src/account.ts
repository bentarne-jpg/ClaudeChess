import type { Body } from "@sjakk/contracts";
import { ApiError } from "./errors.ts";
import type { Deps } from "./ports.ts";
import { puzzleProfile } from "./puzzles.ts";

/** One-time import of the puzzle rating kept in the browser before accounts existed (D6). */
export function importLocal(d: Deps, userId: string, b: Body<"account/import">) {
  return d.store.tx(async (r) => {
    if (await r.ratings.get(userId, "puzzle")) throw new ApiError("conflict", "Account already has a puzzle rating");
    const p = b.puzzle, rating = Math.min(3000, Math.max(400, p.rating));
    await r.ratings.put({
      userId, pool: "puzzle", rating, rd: 0, vol: 0, games: p.games, wins: p.solved, losses: p.failed, streak: 0,
      best: Math.min(3000, Math.max(rating, p.best)), imported: true,
    });
    return { profile: (await puzzleProfile(r, userId))! };
  });
}

export function exportAccount(d: Deps, userId: string) {
  return d.store.tx((r) => r.account.exportAll(userId));
}

/** Delete the login and everything that is the user's own. Finished games stay for opponents, anonymised (S11). */
export async function deleteAccount(d: Deps, userId: string) {
  await d.auth.deleteUser(userId);
  return { deleted: true };
}
