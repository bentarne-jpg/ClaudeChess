import { describe, expect, it } from "vitest";
import { clockAfterMove, newClock, parseTimeControl, syncClock, timeControlKey, timeLeft } from "../src/index.ts";

describe("parseTimeControl", () => {
  it("accepts comma decimals and whole-second increments", () => {
    expect(parseTimeControl("2,5", "3")).toEqual({ tc: { m: 2.5, i: 3 } });
    expect(parseTimeControl(" 10 ", "0")).toEqual({ tc: { m: 10, i: 0 } });
  });
  it("rejects values out of range", () => {
    expect(parseTimeControl("0.1", "0")).toEqual({ error: "minutes" });
    expect(parseTimeControl("181", "0")).toEqual({ error: "minutes" });
    expect(parseTimeControl("5", "1.5")).toEqual({ error: "increment" });
    expect(parseTimeControl("5", "181")).toEqual({ error: "increment" });
    expect(parseTimeControl("abc", "0")).toEqual({ error: "minutes" });
  });
  it("keys time controls", () => {
    expect(timeControlKey(null)).toBe("none");
    expect(timeControlKey({ m: 3, i: 2 })).toBe("3+2");
  });
});

describe("clock", () => {
  it("has no clock without a time control", () => {
    expect(newClock(null)).toBeNull();
    expect(timeLeft(null, "w", 0)).toBe(Infinity);
  });
  it("starts only after both sides have moved, then runs for the side to move", () => {
    let c = newClock({ m: 1, i: 2 })!;
    c = clockAfterMove(c, "w", { ply: 1, turn: "b", over: false }, 1000);
    expect(c.running).toBeNull();
    c = clockAfterMove(c, "b", { ply: 2, turn: "w", over: false }, 5000);
    expect(c.running).toBe("w");
    expect(timeLeft(c, "w", 8000)).toBe(57000);
    expect(timeLeft(c, "b", 8000)).toBe(60000);
  });
  it("adds the increment from the third ply and records history", () => {
    let c = newClock({ m: 1, i: 2 })!;
    c = clockAfterMove(c, "w", { ply: 1, turn: "b", over: false }, 0);
    c = clockAfterMove(c, "b", { ply: 2, turn: "w", over: false }, 0);
    c = clockAfterMove(c, "w", { ply: 3, turn: "b", over: false }, 10000);
    expect(c.w).toBe(52000);
    expect(c.running).toBe("b");
    expect(c.hist[3]).toEqual({ w: 52000, b: 60000 });
    expect(c.hist).toHaveLength(4);
  });
  it("stops when the game is over and does not change the input", () => {
    const c0 = syncClock(newClock({ m: 1, i: 0 })!, { ply: 2, turn: "w", over: false }, 0);
    const c1 = syncClock(c0, { ply: 2, turn: "w", over: true }, 4000);
    expect(c1.running).toBeNull();
    expect(c1.w).toBe(56000);
    expect(c0.running).toBe("w");
  });
});
