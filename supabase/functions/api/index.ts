/*
 * The `api` Edge Function: the server side of every rated or stored action (ADR-0002).
 * It only wires adapters to the shared use cases in packages/server (manifest A3): identity from
 * Supabase Auth, data through Postgres with the service connection, puzzles from the bundled set.
 */
import { handleApi, type Deps } from "@sjakk/server";
import { postgres, postgresStore } from "@sjakk/server/postgres";
import puzzleRows from "../_shared/puzzles.json" with { type: "json" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://bentarne-jpg.github.io,http://localhost:5173,http://localhost:4173").split(",");

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 3, prepare: false });
const byId = new Map((puzzleRows as [string, string, string, number][]).map(([id, fen, moves, rating]) => [id, { id, fen, moves: moves.split(" "), rating }]));

const deps: Deps = {
  store: postgresStore(sql),
  puzzles: { get: (id) => byId.get(id) ?? null },
  clock: { now: () => new Date() },
  auth: {
    async deleteUser(id) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
      if (!r.ok) throw new Error(`delete user failed: ${r.status}`);
    },
  },
};

/** The signed-in user, verified by Supabase Auth (manifest S2). Null when the token is missing or invalid. */
async function userId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return typeof u?.id === "string" ? u.id : null;
}

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ORIGINS.includes(origin) ? origin : ORIGINS[0]!;
  return {
    "Access-Control-Allow-Origin": allow, "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get("Origin")), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "not-found" }), { status: 404, headers });
  const route = new URL(req.url).pathname.replace(/^.*\/api\/?/, "");
  const text = await req.text();
  if (text.length > 250_000) return new Response(JSON.stringify({ error: "bad-request" }), { status: 413, headers });
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { return new Response(JSON.stringify({ error: "bad-request" }), { status: 400, headers }); }
  const reply = await handleApi(deps, route, await userId(req), body);
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers });
});
