import { describe, expect, it } from "vitest";
import { accuracy, classifyMove, lossClass, moveAccuracy, type ClassifyInput, type EngineLine } from "../src/index.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const line = (cp: number, move: string, type: "cp" | "mate" = "cp"): EngineLine => ({ depth: 12, type, val: cp, pv: [move] });
const base = (o: Partial<ClassifyInput> & { uci?: string }): ClassifyInput => ({
  move: { uci: o.uci ?? "e2e4", piece: "p", captured: null, to: (o.uci ?? "e2e4").slice(2, 4), fenBefore: START },
  before: { best: "e2e4", lines: [line(30, "e2e4")] },
  after: { best: "e7e5", lines: [line(-30, "e7e5")] },
  terminal: null,
  ...o,
});

describe("lossClass thresholds", () => {
  it.each([[0, "excellent"], [2, "excellent"], [2.01, "good"], [5, "good"], [5.1, "inaccuracy"], [10, "inaccuracy"],
    [10.1, "mistake"], [20, "mistake"], [20.1, "blunder"]] as const)("loss %s → %s", (loss, cls) => {
    expect(lossClass(loss)).toBe(cls);
  });
});

describe("classifyMove", () => {
  it("waits until both searches are there", () => {
    expect(classifyMove(base({ after: null }))).toBeNull();
    expect(classifyMove(base({ before: { best: "e2e4", lines: [] } }))).toBeNull();
  });
  it("marks the engine's choice as best", () => {
    expect(classifyMove(base({}))).toEqual({ cls: "best", loss: 0 });
  });
  it("marks the only good move as great when the second choice is much worse", () => {
    const r = classifyMove(base({ before: { best: "e2e4", lines: [line(30, "e2e4"), line(-300, "d2d4")] } }));
    expect(r?.cls).toBe("great");
  });
  it("keeps book moves as book unless they lose a lot", () => {
    expect(classifyMove(base({ uci: "a2a3", isBook: true, after: { best: "e7e5", lines: [line(0, "e7e5")] } }))?.cls).toBe("book");
    expect(classifyMove(base({ uci: "a2a3", isBook: true, after: { best: "e7e5", lines: [line(400, "e7e5")] } }))?.cls).toBe("blunder");
  });
  it("grades other moves by lost winning chance", () => {
    const r = classifyMove(base({ uci: "a2a3", after: { best: "e7e5", lines: [line(150, "e7e5")] } }));
    expect(r?.cls).toBe("mistake");
    expect(r?.loss).toBeGreaterThan(10);
  });
  it("calls a move that allows mate a blunder", () => {
    const r = classifyMove(base({ uci: "f2f3", after: { best: "d8h4", lines: [line(2, "d8h4", "mate")] } }));
    expect(r?.cls).toBe("blunder");
  });
  it("marks the only legal move as forced", () => {
    const fen = "7k/8/8/8/8/8/1q6/K7 w - - 0 1"; // Ka1 in check from Qb2: only Kxb2
    const r = classifyMove({ move: { uci: "a1b2", piece: "k", captured: "q", to: "b2", fenBefore: fen },
      before: { best: "a1b2", lines: [line(900, "a1b2")] }, after: { best: "h8g7", lines: [line(-900, "h8g7")] }, terminal: null });
    expect(r?.cls).toBe("forced");
  });
  it("scores a mating move by the terminal result", () => {
    const r = classifyMove(base({ uci: "a2a3", terminal: { cp: null, mate: 0, winner: "w" }, after: null }));
    expect(r?.loss).toBe(0);
  });
  it("spots a brilliant piece offer the opponent should take", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1";
    const r = classifyMove({ move: { uci: "c4f7", piece: "b", captured: "p", to: "f7", fenBefore: fen },
      before: { best: "c4f7", lines: [line(60, "c4f7")] }, after: { best: "e8f7", lines: [line(-60, "e8f7")] }, terminal: null });
    expect(r?.cls).toBe("brilliant");
  });
});

describe("accuracy", () => {
  it("is 100 for perfect play and falls with loss", () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 0);
    expect(moveAccuracy(50)).toBeLessThan(20);
    expect(moveAccuracy(1000)).toBe(0);
  });
  it("averages non-book moves and is null without any", () => {
    expect(accuracy([{ cls: "book", loss: 0 }])).toBeNull();
    expect(accuracy([{ cls: "best", loss: 0 }, { cls: "book", loss: 30 }])).toBeCloseTo(100, 0);
  });
});
