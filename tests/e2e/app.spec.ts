import { expect, test } from "@playwright/test";
import { expectOnScreen, move, open } from "./helpers";

const PGN = '[White "Hvit"]\n[Black "Svart"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Na5 6. Bb5+ c6 7. dxc6 bxc6 8. Qf3 cxb5 9. Qxa8 1-0';

test("home page links to all three modules and loads nothing from other origins", async ({ page }) => {
  const foreign: string[] = [];
  page.on("request", (r) => { if (!r.url().startsWith("http://localhost:4173")) foreign.push(r.url()); });
  const errors = await open(page);
  await expect(page.locator('a.mod[href="#spill"]')).toBeVisible();
  await expect(page.locator('a.mod[href="#notter"]')).toBeVisible();
  await expect(page.locator('a.mod[href="#analyse"]')).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});

test("analysis: paste a PGN, see classified moves, jump to a mistake, explore and return", async ({ page }) => {
  const errors = await open(page, "analyse");
  await page.locator("#a-intake summary").click();
  await page.fill("#a-pgn", PGN);
  await page.click("#a-go");
  await expect(page.locator("#a-view")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__sjakk.A.running), { timeout: 30_000 }).toBe(false);
  await expect(page.locator("#a-summary .acc").first()).not.toHaveText("–");
  const classes = await page.evaluate(() => (window as any).__sjakk.A.G.res.map((r: any) => r.cls));
  expect(classes).toHaveLength(17);
  expect(classes.every((c: string) => c && c !== "pending")).toBe(true);

  await page.evaluate(() => { const A = (window as any).__sjakk.A; A.cur = 6; });
  await page.click("#a-next"); await page.click("#a-prev");
  expect(await page.evaluate(() => (window as any).__sjakk.A.cur)).toBe(6);
  await move(page, "a-board", "f3g5");
  await expect(page.locator("#a-exbar")).toBeVisible();
  await expect(page.locator("#a-extxt")).toContainText("3... Nf6");
  await move(page, "a-board", "d7d5");
  await page.click("#a-prev");
  await move(page, "a-board", "h7h6");
  expect(await page.evaluate(() => (window as any).__sjakk.A.ex.moves.map((m: any) => m.san))).toEqual(["Ng5", "h6"]);
  if (test.info().project.name === "phone") await expectOnScreen(page, ["#a-board", "#a-nav", "#a-exbar"]);
  await page.click("#a-exback");
  await expect(page.locator("#a-jumps")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__sjakk.A.cur)).toBe(6);
  expect(errors).toEqual([]);
});

test("puzzles: choose a level, solve one and see the rating go up", async ({ page }) => {
  const errors = await open(page, "notter");
  await page.click('#p-start [data-level="1200"]');
  const S = () => page.evaluate(() => { const P = (window as any).__sjakk.P; return P.cur && { step: P.cur.step, moves: P.cur.moves, done: P.cur.done, rating: P.profile.rating }; });
  await expect.poll(async () => (await S())?.step ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  for (let guard = 0; guard < 10; guard++) {
    const s = (await S())!;
    if (s.done) break;
    await move(page, "p-board", s.moves[s.step]);
    await page.waitForTimeout(1200);
  }
  await expect.poll(async () => (await S())!.done).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__sjakk.P.profile.rating)).toBeGreaterThan(1200);
  if (test.info().project.name === "phone") await expectOnScreen(page, ["#p-board", "#p-next"]);
  expect(errors).toEqual([]);
});

test("bot game: set up with a clock, play a move, the bot answers, resign", async ({ page }) => {
  const errors = await open(page, "spill");
  await expect(page.locator("#g-new")).toBeVisible();
  await page.locator(".tcchip", { hasText: "3+2" }).click();
  await page.click('.seg [data-color="w"]');
  await page.click("#g-new");
  await move(page, "g-board", "e2e4");
  await expect.poll(() => page.evaluate(() => (window as any).__sjakk.Gm.chess.history().length), { timeout: 15_000 }).toBe(2);
  await expect(page.locator("#g-clock-bot")).toBeVisible();
  if (test.info().project.name === "phone") await expectOnScreen(page, ["#g-clock-top", "#g-board", "#g-clock-bot"]);
  await page.click("#g-resign");
  await page.click("#g-yes");
  await expect(page.locator("#g-board .endcard")).toBeVisible();
  expect(errors).toEqual([]);
});
