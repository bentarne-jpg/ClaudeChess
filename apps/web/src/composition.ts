/*
 * The account for this page load (composition root for accounts, manifest A3).
 * Null when accounts are not configured for this channel, offline, or nobody is signed in.
 */
import { readConfig, type AppConfig } from "./core/config.ts";
import { createAccount, type Account } from "./core/account.ts";
import { createOnline, type LivePort, type Online } from "./core/online.ts";

export interface AccountContext { config: AppConfig; account: Account | null; docs: unknown | null; online: Online | null; live: LivePort | null }

let ctx: Promise<AccountContext> | null = null;

export function accountContext(): Promise<AccountContext> {
  ctx ??= (async () => {
    const config = readConfig(import.meta.env as Record<string, string | undefined>);
    const offline = (globalThis as { OFFLINE?: unknown }).OFFLINE;
    if (!config.supabase || offline) return { config, account: null, docs: null, online: null, live: null };
    const sb = await import("./adapters/supabase.ts");
    const client = sb.supabaseClient(config.supabase.url, config.supabase.anonKey);
    const api = sb.supabaseApi(client, config.supabase.url, config.supabase.anonKey);
    const account = await createAccount({
      auth: sb.supabaseAuth(client), api,
      profiles: sb.supabaseProfiles(client), location: window.location,
    });
    const signedIn = !!account.session;
    return { config, account, docs: signedIn ? sb.supabaseDocs(client, account.session!.userId) : null,
      online: signedIn ? createOnline(api) : null, live: signedIn ? sb.supabaseLive(client) : null };
  })().catch((e) => { console.warn("accounts unavailable", e); return { config: readConfig({}), account: null, docs: null, online: null, live: null }; });
  return ctx;
}

/**
 * The document store the legacy app code uses (manifest §12). Ordinary documents go to `user_docs`;
 * the puzzle profile is the server's (S5), so it maps to the puzzle API instead.
 */
export async function legacyAccountStore(): Promise<{ db: unknown; uid: string } | null> {
  const { account, docs } = await accountContext();
  if (!account?.session || !docs) return null;
  const base = docs as { doc(p: string): unknown; collection(p: string): unknown };
  const puzzleDoc = {
    async get() { const p = await account.puzzleProfile(); return { exists: !!p, data: () => p }; },
    async set(d: { rating: number; games: number; solved: number; failed: number; best: number; seen?: string[] }) {
      const current = await account.puzzleProfile();
      if (current) return; // the server keeps the rating; results are sent one by one
      if (d.games > 0) await account.importPuzzleProfile({ rating: d.rating, games: d.games, solved: d.solved, failed: d.failed, best: d.best, seen: (d.seen ?? []).slice(-600) });
      else if ([800, 1200, 1600, 2000].includes(d.rating)) await account.startPuzzles(d.rating as 800);
    },
    async delete() { await account.resetPuzzles(); },
  };
  return {
    uid: account.session.userId,
    db: { doc: (p: string) => (p.endsWith("/puzzleprofile") ? puzzleDoc : base.doc(p)), collection: (p: string) => base.collection(p) },
  };
}
