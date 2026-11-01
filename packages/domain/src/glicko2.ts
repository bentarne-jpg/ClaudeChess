/*
 * Glicko-2 rating (Mark Glickman, "Example of the Glicko-2 system", 2013).
 * Used for game ratings: one record per player and pool (bullet, blitz, rapid, classical, bot).
 */

export interface Glicko { rating: number; rd: number; vol: number }
/** One game in a rating period: the opponent's rating and RD, and our score (1, 0.5 or 0). */
export interface GlickoResult { rating: number; rd: number; score: 0 | 0.5 | 1 }

export const GLICKO_START: Glicko = { rating: 1500, rd: 350, vol: 0.06 };
const SCALE = 173.7178;
const TAU = 0.5;
const EPS = 0.000001;
/** RD never drops below this, so ratings keep moving; nor rises above the starting RD. */
export const MIN_RD = 45;

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu: number, muj: number, phij: number) => 1 / (1 + Math.exp(-g(phij) * (mu - muj)));

/** The player's new rating after a rating period with the given results (none: RD grows). */
export function glickoUpdate(p: Glicko, results: readonly GlickoResult[]): Glicko {
  const mu = (p.rating - 1500) / SCALE, phi = p.rd / SCALE, sigma = p.vol;
  if (!results.length) {
    const rd = Math.min(GLICKO_START.rd, Math.sqrt(phi * phi + sigma * sigma) * SCALE);
    return { rating: p.rating, rd, vol: sigma };
  }
  let vInv = 0, sum = 0;
  for (const r of results) {
    const muj = (r.rating - 1500) / SCALE, phij = r.rd / SCALE, e = E(mu, muj, phij);
    vInv += g(phij) ** 2 * e * (1 - e);
    sum += g(phij) * (r.score - e);
  }
  const v = 1 / vInv, delta = v * sum;
  // New volatility (Illinois algorithm).
  const a = Math.log(sigma * sigma);
  const f = (x: number) =>
    (Math.exp(x) * (delta * delta - phi * phi - v - Math.exp(x))) / (2 * (phi * phi + v + Math.exp(x)) ** 2) - (x - a) / (TAU * TAU);
  let A = a, B: number;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else { let k = 1; while (f(a - k * TAU) < 0) k++; B = a - k * TAU; }
  let fA = f(A), fB = f(B);
  while (Math.abs(B - A) > EPS) {
    const C = A + ((A - B) * fA) / (fB - fA), fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C; fB = fC;
  }
  const vol = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + vol * vol);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * sum;
  return { rating: muNew * SCALE + 1500, rd: Math.max(MIN_RD, Math.min(GLICKO_START.rd, phiNew * SCALE)), vol };
}

/** Rating pool for a game, from its time control (estimated game length = minutes + 40 × increment s). */
export type Pool = "bullet" | "blitz" | "rapid" | "classical" | "bot" | "puzzle";
export function poolFor(tc: { m: number; i: number } | null): Exclude<Pool, "bot" | "puzzle"> {
  if (!tc) return "classical";
  const seconds = tc.m * 60 + 40 * tc.i;
  if (seconds < 180) return "bullet";
  if (seconds < 480) return "blitz";
  if (seconds < 1500) return "rapid";
  return "classical";
}
