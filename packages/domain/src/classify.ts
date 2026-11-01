import { Chess } from "chess.js";
import type { PieceType } from "chess.js";
import { cpOf, winPercent, type Evaluation, type Search } from "./eval.ts";

export type MoveClass =
  | "brilliant" | "great" | "best" | "excellent" | "good" | "book" | "forced"
  | "inaccuracy" | "mistake" | "blunder";

/** Display order, best first. */
export const CLASS_ORDER: readonly MoveClass[] =
  ["brilliant", "great", "best", "excellent", "good", "book", "forced", "inaccuracy", "mistake", "blunder"];
/** Classes where showing "the engine's best move" would add nothing. */
export const NO_BEST_HINT: readonly MoveClass[] = ["best", "great", "brilliant", "book", "forced"];
/** Classes counted as errors when jumping between mistakes. */
export const ERROR_CLASSES: readonly MoveClass[] = ["inaccuracy", "mistake", "blunder"];

const VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** The class for a move that is not the best, from how much winning chance it gave away. */
export function lossClass(loss: number): MoveClass {
  if (loss <= 2) return "excellent";
  if (loss <= 5) return "good";
  if (loss <= 10) return "inaccuracy";
  if (loss <= 20) return "mistake";
  return "blunder";
}

export interface ClassifyInput {
  move: { uci: string; piece: PieceType; captured: PieceType | null; to: string; fenBefore: string };
  /** Engine search of the position before the move (multipv ≥ 2 enables "great"). */
  before: Search;
  /** Engine search of the position after the move, unless the game ended. */
  after: Search | null;
  /** Set when the move ended the game. */
  terminal: Evaluation | null;
  /** The position after the move is named opening theory. */
  isBook?: boolean;
  /** Destination square of the previous move, to recognise recaptures. */
  prevTo?: string | null;
}

export interface Classification { cls: MoveClass; loss: number }

/**
 * Grade a move by how much winning chance it lost compared with the engine's best move.
 * Returns null while the needed searches are missing.
 */
export function classifyMove(i: ClassifyInput): Classification | null {
  const { move: m, before: A, after: B, terminal: T } = i;
  const first = A.lines[0];
  if (!first || (!B && !T)) return null;
  const before = cpOf(first);
  const match = A.lines.find((l) => l.pv[0] === m.uci);
  let after: number;
  if (T) after = T.mate === 0 ? 10000 : 0;
  else if (match) after = cpOf(match);
  else { const b0 = B?.lines[0]; if (!b0) return null; after = -cpOf(b0); }
  const loss = Math.max(0, winPercent(before) - winPercent(after));
  const allowsMate = after <= -9000 && before > -9000;
  const legal = new Chess(m.fenBefore).moves().length;
  const recapture = !!i.prevTo && i.prevTo === m.to;
  let cls: MoveClass;
  if (i.isBook && loss <= 10 && !allowsMate) cls = "book";
  else if (legal === 1) cls = "forced";
  else if (m.uci === A.best || (match && cpOf(match) === before)) {
    cls = "best";
    const second = A.lines[1] ? cpOf(A.lines[1]) : null;
    if (second != null && winPercent(before) - winPercent(second) >= 10 && winPercent(before) < 97 && !recapture) cls = "great";
    const pv = VALUE[m.piece], cv = m.captured ? VALUE[m.captured] : 0;
    if (m.piece !== "k" && m.piece !== "p" && pv >= 3 && cv < pv && winPercent(before) < 92 &&
        B?.best && B.best.slice(2, 4) === m.to && !recapture) cls = "brilliant";
  } else if (allowsMate) cls = before > -300 ? "blunder" : "mistake";
  else cls = lossClass(loss);
  return { cls, loss: Math.round(loss * 10) / 10 };
}

/** Accuracy for one move (0–100) from its loss in winning chance. */
export const moveAccuracy = (loss: number): number =>
  Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));

/** Average accuracy over the given moves, or null when there are none. Book moves are left out. */
export function accuracy(moves: readonly { cls: MoveClass; loss: number }[]): number | null {
  const counted = moves.filter((r) => r.cls !== "book");
  if (!counted.length) return null;
  return counted.reduce((s, r) => s + moveAccuracy(r.loss), 0) / counted.length;
}
