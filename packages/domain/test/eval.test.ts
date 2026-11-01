import { describe, expect, it } from "vitest";
import { cpOf, terminalEval, whiteEval, whiteWinPercent, winPercent } from "../src/index.ts";

describe("evaluation helpers", () => {
  it("maps mates to large centipawn values, nearer mates larger", () => {
    expect(cpOf({ depth: 1, type: "mate", val: 1, pv: [] })).toBe(9990);
    expect(cpOf({ depth: 1, type: "mate", val: -3, pv: [] })).toBe(-9970);
    expect(cpOf({ depth: 1, type: "cp", val: 42, pv: [] })).toBe(42);
  });
  it("gives 50 % for an equal position and is symmetric", () => {
    expect(winPercent(0)).toBe(50);
    expect(winPercent(300) + winPercent(-300)).toBeCloseTo(100);
    expect(winPercent(10000)).toBeGreaterThan(99.9);
  });
  it("reads White's chances from evaluations", () => {
    expect(whiteWinPercent(null)).toBe(50);
    expect(whiteWinPercent({ cp: null, mate: 0, winner: "w" })).toBe(100);
    expect(whiteWinPercent({ cp: null, mate: 0, winner: "b" })).toBe(0);
    expect(whiteWinPercent({ cp: 0, mate: null, draw: true })).toBe(50);
    expect(whiteWinPercent({ cp: null, mate: -2 })).toBe(0);
  });
  it("flips the engine's score to White's view when Black is to move", () => {
    const s = { best: "e7e5", lines: [{ depth: 10, type: "cp" as const, val: 30, pv: ["e7e5"] }] };
    expect(whiteEval("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", s)).toEqual({ cp: -30, mate: null });
    expect(whiteEval("8/8/8/8/8/8/8/8 w - - 0 1", { best: "(none)", lines: [] })).toBeNull();
  });
  it("recognises checkmate and stalemate", () => {
    expect(terminalEval("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3")).toEqual({ cp: null, mate: 0, winner: "b" });
    expect(terminalEval("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")).toEqual({ cp: 0, mate: null, draw: true });
    expect(terminalEval("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBeNull();
  });
});
