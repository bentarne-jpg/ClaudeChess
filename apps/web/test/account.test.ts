import { describe, expect, it, vi } from "vitest";
import { ApiCallError, createAccount, returnHashFor, type ApiPort, type AuthPort } from "../src/core/account.ts";
import { readConfig } from "../src/core/config.ts";

describe("readConfig", () => {
  it("turns accounts on only with a URL and key, and keeps known providers", () => {
    expect(readConfig({}).supabase).toBeNull();
    expect(readConfig({ VITE_SUPABASE_URL: "javascript:x", VITE_SUPABASE_ANON_KEY: "k" }).supabase).toBeNull();
    const c = readConfig({ VITE_SUPABASE_URL: "https://x.supabase.co/", VITE_SUPABASE_ANON_KEY: "k", VITE_AUTH_PROVIDERS: "google, evil ,custom:vipps" });
    expect(c).toEqual({ supabase: { url: "https://x.supabase.co", anonKey: "k" }, providers: ["google", "custom:vipps"] });
  });
});

function setup(session: { userId: string; email: null } | null, reply: (route: string) => unknown = () => ({}), hash = "#notter") {
  const auth: AuthPort = { session: async () => session, signIn: vi.fn(async () => {}), signOut: vi.fn(async () => {}) };
  const api: ApiPort = { call: vi.fn(async (route: string) => { const r = reply(route); if (r instanceof Error) throw r; return r; }) as never };
  const location = { href: "https://x/app/?a=1" + hash, hash, reload: vi.fn() };
  const store = new Map<string, string>();
  const memo = { get: (k: string) => store.get(k) ?? null, set: (k: string, v: string) => void store.set(k, v), remove: (k: string) => void store.delete(k) };
  const profiles = { get: vi.fn(async () => ({ displayName: "A", ratings: [] })), rename: vi.fn(async () => {}) };
  return { auth, api, location, profiles, memo, store };
}

describe("returning after login", () => {
  it("keeps invitations and games, nothing else", () => {
    expect(returnHashFor("#venn/abcdefghij")).toBe("#venn/abcdefghij");
    expect(returnHashFor("#venn/g/00000000-0000-4000-8000-000000000001")).toBe("#venn/g/00000000-0000-4000-8000-000000000001");
    expect(returnHashFor("#notter")).toBeNull();
    expect(returnHashFor("#venn/<script>")).toBeNull();
  });
  it("remembers the invitation across the login redirect, once", async () => {
    const out = setup(null, () => ({}), "#venn/abcdefghij");
    await (await createAccount(out)).signIn("google");
    expect(out.store.get("sjakk.afterLogin")).toBe("#venn/abcdefghij");
    const back = await createAccount({ ...out, auth: { ...out.auth, session: async () => ({ userId: "u", email: null }) } });
    expect(back.resumeAfterLogin()).toBe("#venn/abcdefghij");
    expect(back.resumeAfterLogin()).toBeNull();
  });
  it("forgets an old target when logging in from elsewhere", async () => {
    const p = setup(null); p.store.set("sjakk.afterLogin", "#venn/abcdefghij");
    await (await createAccount(p)).signIn("google");
    expect(p.store.has("sjakk.afterLogin")).toBe(false);
  });
});

describe("account", () => {
  it("returns to the home page after login", async () => {
    const p = setup(null); const a = await createAccount(p);
    await a.signIn("google");
    expect(p.auth.signIn).toHaveBeenCalledWith("google", "https://x/app/?a=1#hjem");
  });
  it("refuses server calls when signed out", async () => {
    const a = await createAccount(setup(null));
    await expect(a.puzzleProfile()).rejects.toBeInstanceOf(ApiCallError);
  });
  it("treats an already imported profile and an already saved game as no-ops", async () => {
    const a = await createAccount(setup({ userId: "u", email: null }, () => new ApiCallError(409, "conflict")));
    expect(await a.importPuzzleProfile({ rating: 1, games: 1, solved: 1, failed: 0, best: 1 } as never)).toBeNull();
    expect(await a.finishBotGame({} as never)).toBeNull();
  });
  it("passes other errors on", async () => {
    const a = await createAccount(setup({ userId: "u", email: null }, () => new ApiCallError(500, "server-error")));
    await expect(a.finishBotGame({} as never)).rejects.toMatchObject({ status: 500 });
  });
  it("trims names, signs out and deletes with confirmation", async () => {
    const p = setup({ userId: "u", email: null }); const a = await createAccount(p);
    await a.rename("   ");
    expect(p.profiles.rename).toHaveBeenCalledWith("u", "Spiller");
    await a.deleteAccount();
    expect(p.api.call).toHaveBeenCalledWith("account/delete", { confirm: "SLETT" });
    expect(p.auth.signOut).toHaveBeenCalled(); expect(p.location.reload).toHaveBeenCalled();
  });
});
