/* Supabase adapters for the account ports and the per-user document store. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Body, Route } from "@sjakk/contracts";
import { ApiCallError, type ApiPort, type AuthPort, type ProfilePort } from "../core/account.ts";
import type { LivePort } from "../core/online.ts";

export function supabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, { auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true } });
}

export function supabaseAuth(sb: SupabaseClient): AuthPort {
  return {
    async session() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      return u ? { userId: u.id, email: u.email ?? null } : null;
    },
    async signIn(provider, returnTo) {
      const scopes = provider === "custom:vipps" ? "openid name email" : provider === "facebook" ? "public_profile email" : undefined;
      const { error } = await sb.auth.signInWithOAuth({ provider: provider as never, options: { redirectTo: returnTo, ...(scopes ? { scopes } : {}) } });
      if (error) throw error;
    },
    async signOut() { await sb.auth.signOut(); },
  };
}

export function supabaseApi(sb: SupabaseClient, url: string, anonKey: string): ApiPort {
  return {
    async call<R extends Route>(route: R, body: Body<R>) {
      const { data } = await sb.auth.getSession();
      const r = await fetch(`${url}/functions/v1/api/${route}`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: anonKey, Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify(body),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new ApiCallError(r.status, (json as { error?: string }).error ?? "server-error");
      return json;
    },
  };
}

export function supabaseProfiles(sb: SupabaseClient): ProfilePort {
  return {
    async get(userId) {
      const [{ data: p }, { data: r }] = await Promise.all([
        sb.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
        sb.from("ratings").select("pool, rating, games").eq("user_id", userId),
      ]);
      return { displayName: p?.display_name ?? "Spiller", ratings: (r ?? []).map((x) => ({ pool: x.pool, rating: Math.round(x.rating), games: x.games })) };
    },
    async rename(userId, name) {
      const { error } = await sb.from("profiles").update({ display_name: name }).eq("id", userId);
      if (error) throw error;
    },
  };
}

/**
 * The document store the existing app code expects (doc().get/set/delete, collection().where().limit().get()),
 * backed by the `user_docs` table. Paths look like data/users/<id>/<name>.
 */
export function supabaseDocs(sb: SupabaseClient, userId: string) {
  const nameOf = (path: string) => path.split("/").pop()!;
  return {
    doc(path: string) {
      const name = nameOf(path);
      return {
        async get() {
          const { data, error } = await sb.from("user_docs").select("data").eq("user_id", userId).eq("name", name).maybeSingle();
          if (error) throw error;
          return { exists: !!data, data: () => data?.data };
        },
        async set(d: unknown) {
          const { error } = await sb.from("user_docs").upsert({ user_id: userId, name, data: d, updated_at: new Date().toISOString() });
          if (error) throw error;
        },
        async delete() {
          const { error } = await sb.from("user_docs").delete().eq("user_id", userId).eq("name", name);
          if (error) throw error;
        },
      };
    },
    collection() {
      const q = { kind: null as string | null, n: 500 };
      const api = {
        where(_field: "kind", _op: "==", value: string) { q.kind = value; return api; },
        limit(n: number) { q.n = n; return api; },
        async get() {
          let req = sb.from("user_docs").select("data").eq("user_id", userId);
          if (q.kind) req = req.eq("kind", q.kind);
          const { data, error } = await req.limit(q.n);
          if (error) throw error;
          return { docs: (data ?? []).map((r) => ({ data: () => r.data })) };
        },
      };
      return api;
    },
  };
}

/** Realtime: tell the caller when the game row or its moves change (row-level security applies). */
export function supabaseLive(sb: SupabaseClient): LivePort {
  return {
    watch(gameId, onChange) {
      const ch = sb.channel(`game-${gameId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` }, () => onChange())
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "moves", filter: `game_id=eq.${gameId}` }, () => onChange())
        .subscribe();
      return () => { void sb.removeChannel(ch); };
    },
  };
}
