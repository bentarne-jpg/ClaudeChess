import { describe, expect, it } from "vitest";
import { PgnError } from "@sjakk/domain";
import { clockText, evalText, formatMinutes, pgnErrorText, timeControlErrorText, timeControlLabel, timeControlLong } from "../src/core/format.ts";

describe("format", () => {
  it("formats evaluations", () => {
    expect(evalText(null)).toBe("…");
    expect(evalText({ cp: 123, mate: null })).toBe("+1.2");
    expect(evalText({ cp: -40, mate: null })).toBe("−0.4");
    expect(evalText({ cp: 0, mate: null })).toBe("0.0");
    expect(evalText({ cp: null, mate: -3 })).toBe("M3");
    expect(evalText({ cp: null, mate: 0, winner: "b" })).toBe("0–1");
    expect(evalText({ cp: 0, mate: 0 })).toBe("½–½");
  });
  it("formats time controls", () => {
    expect(formatMinutes(2.5)).toBe("2,5");
    expect(formatMinutes(0.5)).toBe("30s");
    expect(timeControlLabel({ m: 3, i: 2 })).toBe("3+2");
    expect(timeControlLabel(null)).toBe("Ingen klokke");
    expect(timeControlLong({ m: 0.5, i: 0 })).toBe("30 s");
    expect(timeControlLong({ m: 10, i: 5 })).toBe("10 min + 5 s per trekk");
    expect(timeControlErrorText("increment")).toMatch(/sekunder/);
  });
  it("formats clocks", () => {
    expect(clockText(Infinity)).toBe("–");
    expect(clockText(-5)).toBe("0,0");
    expect(clockText(9_950)).toBe("9,9");
    expect(clockText(65_000)).toBe("1:05");
    expect(clockText(3_725_000)).toBe("1:02:05");
  });
  it("explains PGN errors in Norwegian", () => {
    expect(pgnErrorText(new PgnError("illegal-move", { moveNumber: 3, side: "b", token: "Qh4" }))).toMatch(/^Trekk 3\.\.\. «Qh4»/);
    expect(pgnErrorText(new PgnError("no-moves"))).toMatch(/Fant ingen trekk/);
    expect(pgnErrorText(new PgnError("bad-fen"))).toMatch(/FEN/);
    expect(pgnErrorText(new PgnError("too-long"))).toMatch(/lang/);
  });
});
