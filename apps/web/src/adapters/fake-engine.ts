/*
 * A deterministic stand-in for Stockfish, used by end-to-end tests (manifest T8).
 * It scores each legal move by material won and returns them best first. Turn it on with ?engine=fake.
 */
import { Chess } from "chess.js";
import type { EngineLine, Search } from "@sjakk/domain";

const VALUE: Record<string, number> = { p: 100, n: 300, b: 300, r: 500, q: 900, k: 0 };

export interface EnginePort {
  search(fen: string, opts?: { depth?: number; multipv?: number; skill?: number; movetime?: number }): Promise<Search>;
  stop(): void;
  newGame(): Promise<void>;
}

export function fakeEngine(): EnginePort {
  return {
    async search(fen, opts = {}) {
      const c = new Chess(fen);
      const moves = c.moves({ verbose: true })
        .map((m) => {
          const uci = m.from + m.to + (m.promotion ?? "");
          const t = new Chess(fen);
          t.move({ from: m.from, to: m.to, promotion: m.promotion });
          const score = t.in_checkmate() ? Infinity : (m.captured ? VALUE[m.captured]! : 0) + (m.promotion ? 800 : 0);
          return { uci, score };
        })
        .sort((a, b) => b.score - a.score || (a.uci < b.uci ? -1 : 1));
      const lines: EngineLine[] = moves.slice(0, Math.max(1, opts.multipv ?? 1)).map((m) =>
        m.score === Infinity
          ? { depth: opts.depth ?? 1, type: "mate", val: 1, pv: [m.uci] }
          : { depth: opts.depth ?? 1, type: "cp", val: m.score, pv: [m.uci] });
      await new Promise((r) => setTimeout(r, 5));
      return { best: moves[0]?.uci ?? "(none)", lines };
    },
    stop() {},
    async newGame() {},
  };
}
