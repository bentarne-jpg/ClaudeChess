import { describe, expect, it } from "vitest";
import type { PvpState } from "@sjakk/contracts";
import { clocksNow, statusText } from "../src/core/online.ts";

const base: PvpState = {
  id: "g", status: "active", rated: true, timeControl: { m: 1, i: 0 }, pool: "bullet",
  white: { id: "a", name: "Alice" }, black: { id: "b", name: "Bob" }, you: "w",
  startFen: "s", fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", ply: 1, moves: [],
  clock: { w: 50_000, b: 40_000, running: "b", serverNow: 0 }, drawOffer: null, result: null, reason: null, inviteCode: null, ratingChange: null,
};

describe("clocksNow", () => {
  it("counts down only the running side, from when the state arrived", () => {
    expect(clocksNow(base, 1000, 4000)).toEqual({ w: 50_000, b: 37_000 });
    expect(clocksNow(base, 1000, 999_999)).toEqual({ w: 50_000, b: 0 });
    expect(clocksNow({ ...base, status: "finished" }, 1000, 4000)).toEqual({ w: 50_000, b: 40_000 });
    expect(clocksNow({ ...base, clock: null }, 0, 0)).toBeNull();
  });
});

describe("statusText", () => {
  it("says whose turn it is and how games end", () => {
    expect(statusText(base)).toBe("Venter på Bob.");
    expect(statusText({ ...base, you: "b" })).toBe("Din tur.");
    expect(statusText({ ...base, drawOffer: "b" })).toBe("Motstanderen tilbyr remis.");
    expect(statusText({ ...base, status: "open" })).toMatch(/Venter på at vennen/);
    expect(statusText({ ...base, status: "finished", result: "0-1", reason: "timeout" })).toBe("Bob vant (tiden gikk ut).");
    expect(statusText({ ...base, status: "finished", result: "1-0", reason: "checkmate" })).toBe("Du vant (sjakkmatt).");
    expect(statusText({ ...base, status: "finished", result: "1/2-1/2", reason: "agreement" })).toBe("Remis (remis etter avtale).");
    expect(statusText({ ...base, status: "aborted" })).toBe("Partiet ble avbrutt.");
  });
});
