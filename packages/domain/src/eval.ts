import { Chess } from "chess.js";

/** One principal variation from the engine, from the side to move's point of view. */
export interface EngineLine { depth: number; type: "cp" | "mate"; val: number; pv: string[] }
/** A finished engine search. `best` is a UCI move or "(none)". */
export interface Search { best: string; lines: EngineLine[] }
/**
 * An evaluation from White's point of view.
 * `mate: 0` means the game is over by checkmate (`winner` says who won); `draw` marks other endings.
 */
export interface Evaluation { cp: number | null; mate: number | null; winner?: "w" | "b"; draw?: boolean }

/** Centipawns for a line, with mates mapped to large values (nearer mates are larger). */
export const cpOf = (l: EngineLine): number =>
  l.type === "mate" ? (10000 - Math.abs(l.val) * 10) * (l.val > 0 ? 1 : -1) : l.val;

/** Winning chances in percent (0–100) for the side the centipawn value belongs to. */
export const winPercent = (cp: number): number => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);

/** White's winning chances in percent for an evaluation; 50 when unknown. */
export function whiteWinPercent(ev: Evaluation | null | undefined): number {
  if (!ev) return 50;
  if (ev.mate === 0) return ev.winner === "w" ? 100 : ev.winner === "b" ? 0 : 50;
  if (ev.mate != null) return ev.mate > 0 ? 100 : 0;
  return winPercent(ev.cp ?? 0);
}

/** The best engine line of a search, turned into an evaluation from White's point of view. */
export function whiteEval(fen: string, search: Search | null | undefined): Evaluation | null {
  const l = search?.lines[0];
  if (!l) return null;
  const sign = fen.split(" ")[1] === "w" ? 1 : -1;
  return l.type === "mate" ? { cp: null, mate: l.val * sign } : { cp: l.val * sign, mate: null };
}

/** The result of a position that has no moves left to search, or null if play goes on. */
export function terminalEval(fen: string): Evaluation | null {
  const c = new Chess(fen);
  if (c.in_checkmate()) return { cp: null, mate: 0, winner: c.turn() === "w" ? "b" : "w" };
  if (c.game_over()) return { cp: 0, mate: null, draw: true };
  return null;
}
