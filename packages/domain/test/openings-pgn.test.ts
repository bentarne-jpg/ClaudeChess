import { describe, expect, it } from "vitest";
import { openingInfo, openingKey, parsePgn, PgnError, MAX_PGN_LENGTH } from "../src/index.ts";

describe("parsePgn", () => {
  it("reads headers, moves, comments and variations", () => {
    const g = parsePgn('[White "A \\"B\\""]\n[Black "C"]\n\n1. e4 {comment} e5 (1... c5 2. Nf3) 2. Nf3!? $1 Nc6 1-0');
    expect(g.headers).toEqual({ White: 'A "B"', Black: "C" });
    expect(g.moves.map((m) => m.san)).toEqual(["e4", "e5", "Nf3", "Nc6"]);
    expect(g.moves[0]).toMatchObject({ uci: "e2e4", c: "w", piece: "p", captured: null });
  });
  it("accepts 0-0 castling and a custom start position", () => {
    const g = parsePgn('[FEN "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"]\n1. 0-0 0-0-0');
    expect(g.moves.map((m) => m.san)).toEqual(["O-O", "O-O-O"]);
  });
  it("reports illegal moves with move number and side", () => {
    try { parsePgn("1. e4 e5 2. Ke3"); expect.unreachable(); }
    catch (e) { expect(e).toBeInstanceOf(PgnError); expect((e as PgnError).detail).toEqual({ moveNumber: 2, side: "w", token: "Ke3" }); }
  });
  it("rejects empty, bad FEN and over-long input", () => {
    expect(() => parsePgn("")).toThrow("no-moves");
    expect(() => parsePgn('[FEN "x"]\n1. e4')).toThrow("bad-fen");
    expect(() => parsePgn("x".repeat(MAX_PGN_LENGTH + 1))).toThrow("too-long");
  });
});

describe("openingInfo", () => {
  it("names the deepest known position and marks book plies", () => {
    const g = parsePgn("1. e4 e5 2. Nf3 a6 3. a3");
    const fens = [g.startFen, ...g.moves.map((m) => m.fen)];
    const table = { [openingKey(fens[1]!)]: ["B00", "King's Pawn"], [openingKey(fens[3]!)]: ["C40", "King's Knight"] } as Record<string, [string, string]>;
    expect(openingInfo(fens, table)).toEqual({ name: "King's Knight", eco: "C40", book: [undefined, true, true, true] });
    expect(openingInfo(fens, null)).toEqual({ name: null, eco: null, book: [] });
  });
});
