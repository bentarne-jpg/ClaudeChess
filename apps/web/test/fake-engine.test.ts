import { describe, expect, it } from "vitest";
import { fakeEngine } from "../src/adapters/fake-engine.ts";

describe("fake engine", () => {
  it("prefers mate, then captures, deterministically", async () => {
    const e = fakeEngine();
    const r = await e.search("rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2", { multipv: 2 });
    expect(r.best).toBe("d8h4");
    expect(r.lines[0]).toMatchObject({ type: "mate", val: 1 });
    expect(r.lines).toHaveLength(2);
    expect((await e.search("8/8/8/8/8/8/8/k1K5 w - - 0 1")).best).not.toBe("(none)");
  });
});
