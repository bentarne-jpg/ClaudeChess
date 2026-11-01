/*
 * Two people play each other in two browsers, through the real api Edge Function and Postgres
 * (tests/e2e/gateway.mjs): challenge link, accept, moves both ways, draw offer, resignation.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { move } from "./helpers";

function login() {
  return (t: string) => {
    const s = { access_token: t, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "x", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} } };
    localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s));
  };
}
async function player(browser: Browser, token: string, hash: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.addInitScript(login(), token);
  await page.goto(`./?engine=fake#${hash}`);
  return page;
}

test("two friends play a game through the server", async ({ browser }) => {
  const alice = await player(browser, "token-alice", "venn");
  await alice.locator("#ol-tcs button", { hasText: "3+2" }).click();
  await alice.locator("#ol-color button", { hasText: "Hvit" }).click();
  await alice.click("#ol-create");
  const link = await alice.locator("#ol-link").inputValue();
  await alice.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await alice.click("#ol-copy");
  await expect(alice.locator("#ol-copied")).toHaveText(/kopiert/);
  expect(await alice.evaluate(() => navigator.clipboard.readText())).toBe(link);
  expect(link).toMatch(/#venn\/[a-z0-9]{10}$/);

  const bob = await player(browser, "token-bob", link.split("#")[1]!);
  await expect(bob.locator("#tab-venn h1")).toHaveText("Alice utfordrer deg");
  await bob.click("#ol-accept");
  await expect(bob.locator("#ol-status")).toHaveText("Venter på Alice.");
  await expect(alice.locator("#ol-status")).toHaveText("Din tur.", { timeout: 10_000 });

  await move(alice, "ol-board", "e2e4");
  await expect(bob.locator("#ol-status")).toHaveText("Din tur.", { timeout: 10_000 });
  await move(bob, "ol-board", "e7e5");
  await expect(alice.locator("#ol-moves")).toHaveText("1. e4 e5", { timeout: 10_000 });
  await expect(alice.locator("#ol-bot .t")).toHaveText(/^3:00$|^2:5\d$/);

  await alice.click("#ol-draw");
  await expect(bob.locator("#ol-status")).toHaveText("Motstanderen tilbyr remis.", { timeout: 10_000 });
  await bob.click("#ol-draw-no");
  await bob.click("#ol-resign");
  await expect(bob.locator("#ol-status")).toHaveText("Alice vant (oppgitt).");
  await expect(alice.locator("#ol-status")).toHaveText("Du vant (oppgitt).", { timeout: 10_000 });
  await expect(alice.locator("#ol-msg")).toHaveText(/Rating \(blitz\): 1500 → 1[6-9]\d\d/, { timeout: 10_000 });
});
