/* Build-time configuration per channel (docs/SETUP-SUPABASE.md). Without it, accounts are hidden. */
export type Provider = "google" | "facebook" | "custom:vipps";
export interface AppConfig { supabase: { url: string; anonKey: string } | null; providers: Provider[] }

const KNOWN: Provider[] = ["google", "facebook", "custom:vipps"];

export function readConfig(env: Record<string, string | undefined>): AppConfig {
  const url = env.VITE_SUPABASE_URL?.trim(), anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  const providers = (env.VITE_AUTH_PROVIDERS ?? "").split(",").map((s) => s.trim()).filter((p): p is Provider => KNOWN.includes(p as Provider));
  return { supabase: url && anonKey && /^https?:\/\//.test(url) ? { url: url.replace(/\/$/, ""), anonKey } : null, providers };
}
