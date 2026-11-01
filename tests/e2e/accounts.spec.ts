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
  const rest: { table: string; method: string; body: any }[] = [];
  let puzzle: any = null;
  const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });
  await page.route(`${SB}/**`, async (r) => {
    const url = new URL(r.request().url());
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (url.pathname.startsWith("/rest/v1/") && r.request().method() !== "GET") rest.push({ table: url.pathname.slice(9), method: r.request().method(), body: r.request().postDataJSON() });
    if (url.pathname === "/rest/v1/profiles") return json(r, r.request().method() === "GET" ? { display_name: "Bent Arne", avatar: null, created_at: "2026-11-01T10:00:00Z" } : []);
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
      if (route === "account/stats") return json(r, {
        ratings: [{ pool: "puzzle", rating: 1234, best: 1250, games: 5, wins: 4, losses: 1, draws: 0 }, { pool: "blitz", rating: 1530, best: 1530, games: 2, wins: 1, losses: 0, draws: 1 }],
        puzzles: { attempts: 5, solved: 4, failed: 1, points: [{ t: Date.UTC(2026, 9, 20), r: 1200 }, { t: Date.UTC(2026, 9, 30), r: 1234 }] },
        games: { total: 3, wins: 2, draws: 1, losses: 0, bot: 1, pvp: 2, points: [{ t: Date.UTC(2026, 9, 25), r: 1500, pool: "blitz" }, { t: Date.UTC(2026, 9, 31), r: 1530, pool: "blitz" }] },
        weeks: Array.from({ length: 12 }, (_, i) => ({ week: `2026-W${34 + i}`, start: 0, puzzles: i % 3, solved: i % 2, games: i % 2, wins: 0 })) });
      return json(r, { error: "not-found" }, 404);
    }
    if (url.pathname.startsWith("/auth/v1/logout")) return json(r, {}, 204);
    return json(r, {});
  });
  return Object.assign(calls, { rest });
}

test("signed out: the profile page asks you to log in", async ({ page }) => {
  await mockSupabase(page);
  await open(page, "profil");
  await expect(page.locator("#tab-profil h1")).toHaveText("Min profil");
  await expect(page.locator("#tab-profil")).toContainText("Logg inn for å se profilen din");
});

test("signed out: the login dialog offers Google, Facebook and Vipps", async ({ page }) => {
  await mockSupabase(page);
  await open(page, "hjem");
  await expect(page.locator("#acct-btn")).toHaveText("Logg inn");
  await page.click("#acct-btn");
  await expect(page.locator("#acct-dlg .providers button")).toHaveText(["Fortsett med Google", "Fortsett med Facebook", "Fortsett med Vipps"]);
  await expect(page.locator('#acct-dlg a[href="personvern.html"]')).toBeVisible();
  await page.locator("#acct-dlg .providers button", { hasText: "Google" }).click();
  await page.waitForURL(/supabase\.test\/auth\/v1\/authorize\?provider=google/);
});

test("signed in: the name in the bar leads to the profile with ratings, charts and account actions", async ({ page }) => {
  await mockSupabase(page);
  await open(page, "hjem", signedIn);
  await expect(page.locator("#acct-btn")).toHaveText("BBent Arne");
  await page.click("#acct-btn");
  await expect(page).toHaveURL(/#profil$/);
  await expect(page.locator("#pf-name")).toHaveText("Bent Arne");
  await expect(page.locator("#pf-ratings")).toContainText("Sjakknøtter");
  await expect(page.locator("#pf-ratings")).toContainText("1234");
  await expect(page.locator("#pf-ratings")).toContainText("Lynsjakk");
  await expect(page.locator("#pf-dev svg path")).toHaveCount(2);
  await expect(page.locator("#pf-activity svg rect").first()).toBeVisible();
  await expect(page.locator("#pf-activity")).toContainText("80 %");
  const dl = page.waitForEvent("download");
  await page.locator("#tab-profil button", { hasText: "Last ned mine data" }).click();
  expect((await dl).suggestedFilename()).toBe("sjakkverkstedet-mine-data.json");
  await page.click("#pf-delete");
  await page.click("#pf-del-go");
  await expect(page.locator("#pf-msg")).toHaveText("Skriv SLETT for å bekrefte.");
});

test("signed in: change name and pick a profile picture", async ({ page }) => {
  const calls = await mockSupabase(page);
  await open(page, "profil", signedIn);
  await page.fill("#pf-name-input", "  Bent  ");
  await page.click("#pf-save-name");
  await expect(page.locator("#pf-name")).toHaveText("Bent");
  await page.locator("#pf-pieces button").nth(2).click();      // white rook
  await page.locator("#pf-colours button").nth(1).click();     // blue
  await page.click("#pf-save-avatar");
  await expect(page.locator("#pf-msg")).toHaveText("Profilbildet er lagret.");
  expect(calls.rest.filter((x) => x.table === "profiles").map((x) => x.body)).toEqual([{ display_name: "Bent" }, { avatar: "piece:wr:blue" }]);
  await expect(page.locator("#acct-btn img")).toBeVisible();
});

test("first login: activity saved in the browser by older versions is moved to the account and removed locally", async ({ page }) => {
  const calls = await mockSupabase(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mine-partier", JSON.stringify([{ kind: "game", id: "b_old", source: "bot", color: "w", result: "1-0", ended: 1, pgn: "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0" }]));
  });
  await open(page, "analyse", signedIn);
  await expect.poll(() => calls.rest.filter((x) => x.table === "user_docs").map((x) => x.body.name)).toContain("b_old");
  expect(await page.evaluate(() => localStorage.getItem("mine-partier"))).toBeNull();
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

test("signed out: an invitation link explains the invite and comes back to it after login", async ({ page }) => {
  await mockSupabase(page);
  await open(page, "venn/abcdefghij");
  await expect(page.locator("#tab-venn h1")).toHaveText("Du er invitert til et parti");
  await expect(page.locator("#ol-login")).toHaveText("Logg inn og bli med");
  await page.click("#ol-login");
  await page.locator("#acct-dlg .providers button", { hasText: "Google" }).click();
  await page.waitForURL(/supabase\.test\/auth\/v1\/authorize/);
  // Back from the provider, signed in, on the home page: the app returns to the invitation.
  await page.addInitScript(signedIn);
  await page.goto("./?engine=fake&test#hjem");
  await expect(page).toHaveURL(/#venn\/abcdefghij$/);
});

test("copying the invitation link falls back when the clipboard API is refused", async ({ page }) => {
  await mockSupabase(page);
  await page.route("http://supabase.test/functions/v1/api/pvp/create", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000001", status: "open", inviteCode: "abcdefghij", you: "w" }) }));
  await page.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) } }); });
  await open(page, "venn", signedIn);
  await page.click("#ol-create");
  await page.click("#ol-copy");
  await expect(page.locator("#ol-copied")).toHaveText(/kopiert|markert/);
  expect(await page.evaluate(() => { const f = document.getElementById("ol-link") as HTMLInputElement; return f.selectionEnd! - f.selectionStart!; })).toBeGreaterThan(20);
});
