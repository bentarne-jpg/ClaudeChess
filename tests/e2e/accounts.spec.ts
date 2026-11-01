/*
 * Accounts against a mocked Supabase (manifest T5): login choices, the signed-in account dialog,
 * and that puzzle results and finished bot games are sent to the server.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { move, open } from "./helpers";

const SB = "http://supabase.test";

function signedIn() {
  const s = { access_token: "token", refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "11111111-1111-4111-8111-111111111111", email: "a@example.com", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} } };
  localStorage.setItem("sb-supabase-auth-token", JSON.stringify(s));
}

/** Fake Supabase: REST tables, the api function, and a record of what the app sent. */
async function mockSupabase(page: Page) {
  const calls: { route: string; body: any }[] = [];
  let puzzle: any = null;
  const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });
  await page.route(`${SB}/**`, async (r) => {
    const url = new URL(r.request().url());
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (url.pathname === "/rest/v1/profiles") return json(r, r.request().method() === "GET" ? { display_name: "Bent Arne" } : []);
    if (url.pathname === "/rest/v1/ratings") return json(r, [{ pool: "puzzle", rating: 1234, games: 5 }]);
    if (url.pathname === "/rest/v1/user_docs") return json(r, r.request().method() === "GET" ? [] : null, r.request().method() === "GET" ? 200 : 201);
    if (url.pathname.startsWith("/functions/v1/api/")) {
      const route = url.pathname.replace("/functions/v1/api/", ""), body = r.request().postDataJSON();
      calls.push({ route, body });
      expect(r.request().headers()["authorization"]).toBe("Bearer token");
      const prof = (rating: number, games: number) => ({ rating, games, solved: games, failed: 0, streak: games, best: rating, hist: [rating], seen: [], log: [], updated: 1 });
      if (route === "puzzle/profile") return json(r, { profile: puzzle });
      if (route === "puzzle/start") { puzzle = prof(body.level, 0); return json(r, { profile: puzzle }); }
      if (route === "puzzle/result") { puzzle = prof(puzzle.rating + 7, puzzle.games + 1); return json(r, { profile: puzzle, delta: 7, rated: true }); }
      if (route === "bot-game/finish") return json(r, { gameId: "g1", result: "0-1", rated: true, rating: { pool: "bot", before: 1500, after: 1488 } });
      if (route === "account/export") return json(r, { ratings: [] });
      return json(r, { error: "not-found" }, 404);
    }
    if (url.pathname.startsWith("/auth/v1/logout")) return json(r, {}, 204);
    return json(r, {});
  });
  return calls;
}

test("signed out: the login dialog offers Google, Facebook and Vipps", async ({ page }) => {
  await mockSupabase(page);
  await open(page, "hjem");
  await expect(page.locator("#acct-btn")).toHaveText("Logg inn");
  await page.click("#acct-btn");
  await expect(page.locator("#acct-dlg .providers button")).toHaveText(["Fortsett med Google", "Fortsett med Facebook", "Fortsett med Vipps"]);
  await page.locator("#acct-dlg .providers button", { hasText: "Google" }).click();
  await page.waitForURL(/supabase\.test\/auth\/v1\/authorize\?provider=google/);
});

test("signed in: name in the bar, ratings and data download in the dialog", async ({ page }) => {
  await mockSupabase(page);
  await open(page, "hjem", signedIn);
  await expect(page.locator("#acct-btn")).toHaveText("Bent Arne");
  await page.click("#acct-btn");
  await expect(page.locator("#acct-dlg .ratings")).toContainText("Sjakknøtter");
  await expect(page.locator("#acct-dlg .ratings")).toContainText("1234");
  const dl = page.waitForEvent("download");
  await page.locator("#acct-dlg button", { hasText: "Last ned mine data" }).click();
  expect((await dl).suggestedFilename()).toBe("sjakkverkstedet-mine-data.json");
  await page.locator("#acct-dlg button", { hasText: "Slett kontoen" }).click();
  await page.click("#acct-del-go");
  await expect(page.locator("#acct-dlg .msg")).toHaveText("Skriv SLETT for å bekrefte.");
});

test("signed in: puzzle results go to the server, which owns the rating", async ({ page }) => {
  const calls = await mockSupabase(page);
  await open(page, "notter", signedIn);
  await page.click('#p-start [data-level="1200"]');
  await expect.poll(() => calls.map((c) => c.route)).toContain("puzzle/start");
  const S = () => page.evaluate(() => { const P = (window as any).__sjakk.P; return P.cur && { step: P.cur.step, moves: P.cur.moves, done: P.cur.done }; });
  await expect.poll(async () => (await S())?.step ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  for (let i = 0; i < 10; i++) { const s = (await S())!; if (s.done) break; await move(page, "p-board", s.moves[s.step]); await page.waitForTimeout(1200); }
  await expect.poll(() => calls.find((c) => c.route === "puzzle/result")?.body.solved).toBe(true);
  const sent = calls.find((c) => c.route === "puzzle/result")!.body;
  expect(sent.moves.length).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as any).__sjakk.P.profile.rating)).toBe(1207);
});

test("signed in: a resigned bot game is sent once with its moves", async ({ page }) => {
  const calls = await mockSupabase(page);
  await open(page, "spill", signedIn);
  await page.click('.seg [data-color="w"]');
  await page.click("#g-new");
  await move(page, "g-board", "e2e4");
  await expect.poll(() => page.evaluate(() => (window as any).__sjakk.Gm.chess.history().length), { timeout: 15_000 }).toBe(2);
  await page.click("#g-resign"); await page.click("#g-yes");
  await expect.poll(() => calls.filter((c) => c.route === "bot-game/finish").length).toBe(1);
  expect(calls.find((c) => c.route === "bot-game/finish")!.body).toMatchObject({ color: "w", reason: "resign" });
  await expect(page.locator("#g-msg")).toHaveText("Bot-rating: 1500 → 1488");
});
