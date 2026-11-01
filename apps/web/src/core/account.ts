/*
 * Client-side account use cases (manifest A2). Talks to the outside only through the ports below;
 * the Supabase adapter implements them, tests use fakes.
 */
import type { Body, PuzzleProfile, Route } from "@sjakk/contracts";
import type { Provider } from "./config.ts";

export interface Session { userId: string; email: string | null }
export interface AuthPort {
  session(): Promise<Session | null>;
  signIn(provider: Provider, returnTo: string): Promise<void>;
  signOut(): Promise<void>;
}
export class ApiCallError extends Error { constructor(public status: number, public code: string) { super(code); } }
export interface ApiPort { call<R extends Route>(route: R, body: Body<R>): Promise<unknown> }
export interface ProfilePort {
  get(userId: string): Promise<{ displayName: string; ratings: { pool: string; rating: number; games: number }[] }>;
  rename(userId: string, name: string): Promise<void>;
}

/** Small key-value memory that survives the login redirect (sessionStorage in the browser). */
export interface MemoPort { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }

const RETURN_KEY = "sjakk.afterLogin";
/** Where to land after logging in: back on an invitation (or a game), otherwise the home page. */
export const returnHashFor = (hash: string): string | null => (/^#venn\/[a-z0-9/-]{1,60}$/.test(hash) ? hash : null);

export interface Account {
  readonly session: Session | null;
  signIn(p: Provider): Promise<void>;
  /** After the login redirect: the page the person was on when they chose to log in, once. */
  resumeAfterLogin(): string | null;
  signOut(): Promise<void>;
  puzzleProfile(): Promise<PuzzleProfile | null>;
  startPuzzles(level: 800 | 1200 | 1600 | 2000): Promise<PuzzleProfile>;
  resetPuzzles(): Promise<void>;
  puzzleResult(b: Body<"puzzle/result">): Promise<{ profile: PuzzleProfile; delta: number; rated: boolean }>;
  importPuzzleProfile(p: Body<"account/import">["puzzle"]): Promise<PuzzleProfile | null>;
  finishBotGame(b: Body<"bot-game/finish">): Promise<{ gameId: string; result: string; rated: boolean; rating: { before: number; after: number } | null } | null>;
  overview(): Promise<{ displayName: string; ratings: { pool: string; rating: number; games: number }[] }>;
  rename(name: string): Promise<void>;
  exportData(): Promise<unknown>;
  deleteAccount(): Promise<void>;
}

export async function createAccount(ports: {
  auth: AuthPort; api: ApiPort; profiles: ProfilePort; location: { href: string; hash: string; reload(): void }; memo?: MemoPort;
}): Promise<Account> {
  const { auth, api, profiles, location, memo } = ports;
  const session = await auth.session();
  const need = () => { if (!session) throw new ApiCallError(401, "unauthorized"); return session; };
  return {
    session,
    signIn(p) {
      const back = returnHashFor(location.hash);
      try { if (back) memo?.set(RETURN_KEY, back); else memo?.remove(RETURN_KEY); } catch { /* storage blocked: land on home */ }
      return auth.signIn(p, location.href.split("#")[0] + "#hjem");
    },
    resumeAfterLogin() {
      if (!session) return null;
      try { const h = memo?.get(RETURN_KEY) ?? null; memo?.remove(RETURN_KEY); return h && returnHashFor(h); } catch { return null; }
    },
    async signOut() { await auth.signOut(); location.reload(); },
    async puzzleProfile() { need(); return ((await api.call("puzzle/profile", {})) as { profile: PuzzleProfile | null }).profile; },
    async startPuzzles(level) { need(); return ((await api.call("puzzle/start", { level })) as { profile: PuzzleProfile }).profile; },
    async resetPuzzles() { need(); await api.call("puzzle/reset", {}); },
    async puzzleResult(b) { need(); return (await api.call("puzzle/result", b)) as never; },
    async importPuzzleProfile(puzzle) {
      need();
      try { return ((await api.call("account/import", { puzzle })) as { profile: PuzzleProfile }).profile; }
      catch (e) { if (e instanceof ApiCallError && e.status === 409) return null; throw e; }
    },
    async finishBotGame(b) {
      need();
      try { return (await api.call("bot-game/finish", b)) as never; }
      catch (e) { if (e instanceof ApiCallError && e.status === 409) return null; throw e; } // already saved
    },
    overview: () => profiles.get(need().userId),
    rename: (name) => profiles.rename(need().userId, name.trim().slice(0, 40) || "Spiller"),
    async exportData() { need(); return api.call("account/export", {}); },
    async deleteAccount() { need(); await api.call("account/delete", { confirm: "SLETT" }); await auth.signOut(); location.reload(); },
  };
}
