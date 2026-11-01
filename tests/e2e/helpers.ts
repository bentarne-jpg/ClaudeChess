import { expect, type Page } from "@playwright/test";

/** Open the app with the deterministic engine and the read-only test view of the state. */
export async function open(page: Page, hash = "hjem", init?: () => void) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && /Content.Security.Policy/i.test(m.text())) errors.push(m.text()); });
  if (init) await page.addInitScript(init);
  await page.goto(`./?engine=fake&test#${hash}`);
  return errors;
}

/** Make a move on a board by tapping the two squares. */
export async function move(page: Page, board: string, uci: string) {
  await page.locator(`#${board} .sq[data-sq="${uci.slice(0, 2)}"]`).click();
  await page.locator(`#${board} .sq[data-sq="${uci.slice(2, 4)}"]`).click();
}

/** The given parts are fully on screen without scrolling (manifest U2: board and controls fit on a phone). */
export async function expectOnScreen(page: Page, selectors: string[]) {
  for (const sel of selectors) {
    const box = await page.locator(sel).first().boundingBox();
    expect(box, sel).not.toBeNull();
    const ih = await page.evaluate(() => innerHeight);
    expect(box!.y + box!.height, `${sel} bottom`).toBeLessThanOrEqual(ih + 1);
  }
}
