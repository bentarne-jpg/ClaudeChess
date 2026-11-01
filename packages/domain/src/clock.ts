import type { Color } from "chess.js";

/** A time control: minutes for the game and seconds added per move. */
export interface TimeControl { m: number; i: number }

/** Preset time controls offered in the app, as [minutes, increment]. */
export const TIME_CONTROL_PRESETS: readonly (readonly [number, number])[] =
  [[1, 0], [1, 1], [2, 1], [3, 0], [3, 2], [5, 0], [5, 3], [5, 10], [10, 0], [10, 5], [15, 10], [30, 0]];

export const timeControlKey = (t: TimeControl | null): string => (t ? `${t.m}+${t.i}` : "none");

export type TimeControlError = "minutes" | "increment";

/** Parse what a player typed. Minutes 0.25–180 (comma or dot), increment 0–180 whole seconds. */
export function parseTimeControl(minutesText: string, incrementText: string): { tc: TimeControl } | { error: TimeControlError } {
  const rm = String(minutesText).trim().replace(",", "."), ri = String(incrementText).trim();
  const m = /^\d+(\.\d+)?$/.test(rm) ? parseFloat(rm) : NaN;
  const i = /^\d+$/.test(ri) ? parseInt(ri, 10) : NaN;
  if (!(m >= 0.25 && m <= 180)) return { error: "minutes" };
  if (!(i >= 0 && i <= 180)) return { error: "increment" };
  return { tc: { m: Math.round(m * 100) / 100, i } };
}

/** The clock of one game. Times in ms; `since` is the time `running` started, on the caller's clock. */
export interface Clock {
  tc: TimeControl; w: number; b: number; inc: number;
  running: Color | null; since: number;
  /** Time left for both sides after each ply, so undo can restore it. */
  hist: { w: number; b: number }[];
}

export interface ClockPosition { ply: number; turn: Color; over: boolean }

export function newClock(tc: TimeControl | null): Clock | null {
  if (!tc) return null;
  const t = tc.m * 60000;
  return { tc, w: t, b: t, inc: tc.i * 1000, running: null, since: 0, hist: [{ w: t, b: t }] };
}

/** Time left for `side` at time `now`. Infinity without a clock. */
export function timeLeft(c: Clock | null, side: Color, now: number): number {
  if (!c) return Infinity;
  return c.running === side ? c[side] - (now - c.since) : c[side];
}

/** Make the clock follow the position: the side to move runs from ply 2 until the game is over. */
export function syncClock(c: Clock, pos: ClockPosition, now: number): Clock {
  const next = { ...c };
  const want = pos.over ? null : pos.ply >= 2 ? pos.turn : null;
  if (next.running && next.running !== want) { next[next.running] -= now - next.since; next.running = null; }
  if (want && !next.running) { next.running = want; next.since = now; }
  return next;
}

/** Record that `mover` has just completed the move that reached `pos`; adds the increment from ply 3. */
export function clockAfterMove(c: Clock, mover: Color, pos: ClockPosition, now: number): Clock {
  const next = { ...c, hist: c.hist.slice(0, pos.ply) };
  if (next.running === mover) { next[mover] -= now - next.since; next.running = null; }
  if (pos.ply >= 3) next[mover] += next.inc;
  next.hist[pos.ply] = { w: next.w, b: next.b };
  return syncClock(next, pos, now);
}
