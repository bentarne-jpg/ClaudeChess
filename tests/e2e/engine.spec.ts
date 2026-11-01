/* Smoke tests with the real Stockfish engine (manifest T8: kept small and separate). */
import { expect, test } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const MATE = '[White "A"]\n[Black "B"]\n\n1. f3 e5 2. g4 Qh4# 0-1';

async function analyse(page: import("@playwright/test").Page) {
  await page.locator("#a-intake summary").click();
  await page.fill("#a-pgn", MATE);
  await page.click("#a-go");
  await expect.poll(() => page.evaluate(() => {
    const A = (window as any).__sjakk?.A; return A && A.G && !A.running && A.G.res.every(Boolean);
  }), { timeout: 60_000 }).toBe(true);
  return page.evaluate(() => (window as any).__sjakk.A.G.res.map((r: any) => r.cls));
}

test.describe("real engine", () => {
  test.beforeEach(() => { test.skip(test.info().project.name !== "desktop", "desktop only"); });

  test("the web build analyses a game with Stockfish", async ({ page }) => {
    await page.goto("./?test#analyse");
    const cls = await analyse(page);
    expect(cls).toHaveLength(4);
    expect(cls[2]).toBe("blunder"); // 2. g4?? allows mate
  });

  test("the offline file runs from disk with the engine inlined", async ({ page }) => {
    const file = resolve("dist/Sjakkverkstedet-offline.html");
    test.skip(!existsSync(file), "run tools/build_offline.py first");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(pathToFileURL(file).href + "?test#analyse");
    const cls = await analyse(page);
    expect(cls[2]).toBe("blunder");
    expect(errors).toEqual([]);
  });
});
