/*
 * Statistics for the profile page, computed on the server from stored facts (manifest D3):
 * ratings per pool, rating over time, results, and activity per week.
 */
import type { FinishedGame, PuzzleAttempt, RatingRow } from "./ports.ts";
import type { Deps } from "./ports.ts";

export interface Stats {
  ratings: { pool: string; rating: number; best: number; games: number; wins: number; losses: number; draws: number }[];
  puzzles: { attempts: number; solved: number; failed: number; points: { t: number; r: number }[] };
  games: { total: number; wins: number; draws: number; losses: number; bot: number; pvp: number; points: { t: number; r: number; pool: string }[] };
  weeks: { week: string; start: number; puzzles: number; solved: number; games: number; wins: number }[];
}

/** ISO week label ("2026-W44") and the Monday it starts on (UTC). */
export function isoWeek(d: Date): { week: string; start: number } {
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  const thursday = new Date(monday + 3 * 86400000);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const n = Math.floor((thursday.getTime() - yearStart) / (7 * 86400000)) + 1;
  return { week: `${thursday.getUTCFullYear()}-W${String(n).padStart(2, "0")}`, start: monday };
}

const won = (g: FinishedGame) => g.result === (g.color === "w" ? "1-0" : "0-1");
const lost = (g: FinishedGame) => g.result === (g.color === "w" ? "0-1" : "1-0");

/** Build the statistics. `attempts` newest first (as stored), `games` oldest first; `weeks` most recent. */
export function buildStats(ratings: RatingRow[], attempts: PuzzleAttempt[], games: FinishedGame[], now: Date, weeks = 12): Stats {
  const chron = [...attempts].reverse();
  const out: Stats = {
    ratings: ratings.map((r) => {
      const inPool = r.pool === "puzzle" ? [] : games.filter((g) => g.pool === r.pool || (r.pool === "bot" && g.kind === "bot"));
      return { pool: r.pool, rating: Math.round(r.rating), best: Math.round(r.best), games: r.games, wins: r.wins, losses: r.losses,
        draws: r.pool === "puzzle" ? 0 : inPool.filter((g) => g.result === "1/2-1/2").length };
    }),
    puzzles: {
      attempts: chron.length, solved: chron.filter((a) => a.solved).length, failed: chron.filter((a) => !a.solved).length,
      points: chron.map((a) => ({ t: a.createdAt.getTime(), r: Math.round(a.ratingAfter) })),
    },
    games: {
      total: games.length, wins: games.filter(won).length, losses: games.filter(lost).length,
      draws: games.filter((g) => g.result === "1/2-1/2").length,
      bot: games.filter((g) => g.kind === "bot").length, pvp: games.filter((g) => g.kind === "pvp").length,
      points: games.filter((g) => g.ratingAfter != null).map((g) => ({ t: g.endedAt.getTime(), r: Math.round(g.ratingAfter!), pool: g.kind === "bot" ? "bot" : g.pool ?? "" })),
    },
    weeks: [],
  };
  const current = isoWeek(now);
  for (let i = weeks - 1; i >= 0; i--) {
    const w = isoWeek(new Date(current.start - i * 7 * 86400000));
    out.weeks.push({ week: w.week, start: w.start, puzzles: 0, solved: 0, games: 0, wins: 0 });
  }
  const slot = (d: Date) => out.weeks.find((w) => w.week === isoWeek(d).week);
  for (const a of chron) { const w = slot(a.createdAt); if (w) { w.puzzles++; if (a.solved) w.solved++; } }
  for (const g of games) { const w = slot(g.endedAt); if (w) { w.games++; if (won(g)) w.wins++; } }
  return out;
}

export function accountStats(d: Deps, userId: string) {
  return d.store.tx(async (r) => buildStats(await r.ratings.list(userId), await r.puzzleAttempts.recent(userId, 2000), await r.history.gamesFor(userId), d.clock.now()));
}
