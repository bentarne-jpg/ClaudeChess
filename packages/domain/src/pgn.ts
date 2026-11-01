import { Chess } from "chess.js";
import type { Color, PieceType } from "chess.js";

export interface ParsedMove {
  san: string; from: string; to: string; c: Color; piece: PieceType; captured: PieceType | null;
  uci: string; fenBefore: string; fen: string;
}
export interface ParsedGame { headers: Record<string, string>; startFen: string; moves: ParsedMove[] }

export type PgnErrorCode = "bad-fen" | "illegal-move" | "no-moves" | "too-long";
export class PgnError extends Error {
  constructor(public code: PgnErrorCode, public detail: { moveNumber?: number; side?: Color; token?: string } = {}) {
    super(code);
    this.name = "PgnError";
  }
}

/** Longest PGN accepted (manifest S6). */
export const MAX_PGN_LENGTH = 200_000;

/** Parse a PGN: headers, start position and the main line. Comments, variations and NAGs are ignored. */
export function parsePgn(input: string): ParsedGame {
  let text = String(input ?? "").replace(/\r/g, "");
  if (text.length > MAX_PGN_LENGTH) throw new PgnError("too-long");
  const headers: Record<string, string> = {};
  text = text.replace(/^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm, (_m, k: string, v: string) => {
    headers[k] = v.replace(/\\"/g, '"');
    return "";
  });
  let body = text.replace(/\{[^}]*\}/g, " ").replace(/;[^\n]*/g, " ");
  let prev: string;
  do { prev = body; body = body.replace(/\([^()]*\)/g, " "); } while (body !== prev);
  body = body.replace(/\$\d+/g, " ");
  const fen = headers.FEN || null;
  const g = fen ? new Chess(fen) : new Chess();
  if (fen && g.fen().split(" ")[0] !== fen.split(" ")[0]) throw new PgnError("bad-fen");
  const startFen = g.fen();
  const moves: ParsedMove[] = [];
  for (let t of body.split(/\s+/)) {
    if (!t) continue;
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) break;
    t = t.replace(/^\d+\.(\.\.)?/, "");
    if (!t || /^\.+$/.test(t)) continue;
    t = t.replace(/[!?]+$/, "").replace(/^0-0-0/, "O-O-O").replace(/^0-0/, "O-O");
    const fb = g.fen();
    const mv = g.move(t, { sloppy: true });
    if (!mv) {
      const parts = fb.split(" ");
      throw new PgnError("illegal-move", { moveNumber: Number(parts[5]), side: parts[1] as Color, token: t });
    }
    moves.push({
      san: mv.san, from: mv.from, to: mv.to, c: mv.color, piece: mv.piece, captured: mv.captured ?? null,
      uci: mv.from + mv.to + (mv.promotion ?? ""), fenBefore: fb, fen: g.fen(),
    });
  }
  if (!moves.length) throw new PgnError("no-moves");
  return { headers, startFen, moves };
}
