import { describe, expect, it } from "vitest";
import { glickoUpdate, GLICKO_START, MIN_RD, poolFor } from "../src/index.ts";

describe("Glicko-2", () => {
  it("matches Glickman's worked example", () => {
    const r = glickoUpdate({ rating: 1500, rd: 200, vol: 0.06 }, [
      { rating: 1400, rd: 30, score: 1 }, { rating: 1550, rd: 100, score: 0 }, { rating: 1700, rd: 300, score: 0 }]);
    expect(r.rating).toBeCloseTo(1464.06, 1);
    expect(r.rd).toBeCloseTo(151.52, 1);
    expect(r.vol).toBeCloseTo(0.05999, 4);
  });
  it("grows RD without games, capped at the start value", () => {
    expect(glickoUpdate({ rating: 1600, rd: 100, vol: 0.06 }, []).rd).toBeGreaterThan(100);
    expect(glickoUpdate(GLICKO_START, []).rd).toBe(350);
  });
  it("moves a new player a lot and keeps RD above the floor", () => {
    let p = GLICKO_START;
    const r = glickoUpdate(p, [{ rating: 1500, rd: 50, score: 1 }]);
    expect(r.rating - 1500).toBeGreaterThan(100);
    for (let i = 0; i < 300; i++) p = glickoUpdate(p, [{ rating: 1500, rd: 50, score: 0.5 }]);
    expect(p.rd).toBeGreaterThanOrEqual(MIN_RD);
    expect(p.rating).toBeCloseTo(1500, 0);
  });
  it("loses rating for a loss against a weaker player", () => {
    const r = glickoUpdate({ rating: 1800, rd: 60, vol: 0.06 }, [{ rating: 1400, rd: 60, score: 0 }]);
    expect(r.rating).toBeLessThan(1800);
  });
});

describe("poolFor", () => {
  it.each([[null, "classical"], [{ m: 1, i: 0 }, "bullet"], [{ m: 2, i: 1 }, "bullet"], [{ m: 3, i: 0 }, "blitz"],
    [{ m: 5, i: 3 }, "blitz"], [{ m: 10, i: 0 }, "rapid"], [{ m: 15, i: 10 }, "rapid"], [{ m: 30, i: 0 }, "classical"]] as const)(
    "%j → %s", (tc, pool) => expect(poolFor(tc)).toBe(pool));
});
