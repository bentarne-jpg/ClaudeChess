/*
 * A small stand-in for a Supabase project, for the two-browser end-to-end test (manifest T5):
 * a fresh Postgres with the real migrations, the real `api` Edge Function running in Deno, and
 * Auth/REST endpoints that know two test logins. Realtime is absent, so the app's polling is used.
 * Needs DATABASE_URL and Deno (npm i). Listens on :54321.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const ROOT = resolve(import.meta.dirname, "../..");
const USERS = { "token-alice": ["11111111-1111-4111-8111-111111111111", "Alice"], "token-bob": ["22222222-2222-4222-8222-222222222222", "Bob"] };

const admin = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const name = `e2e_${Date.now()}`;
await admin.unsafe(`create database ${name}`);
const u = new URL(process.env.DATABASE_URL); u.pathname = `/${name}`;
const sql = postgres(u.toString(), { max: 2, onnotice: () => {} });
await sql.unsafe(readFileSync(`${ROOT}/packages/server/test/auth_stub.sql`, "utf8"));
for (const f of readdirSync(`${ROOT}/supabase/migrations`).sort()) await sql.unsafe(readFileSync(`${ROOT}/supabase/migrations/${f}`, "utf8"));
for (const [id, full] of Object.values(USERS)) await sql`insert into auth.users (id, raw_user_meta_data) values (${id}, ${sql.json({ full_name: full })})`;

const fn = spawn(resolve(ROOT, "node_modules/.bin/deno"), ["run", "--allow-net", "--allow-env", "--allow-read",
  `--config=${ROOT}/supabase/functions/api/deno.json`, `${ROOT}/supabase/functions/api/index.ts`], {
  env: { ...process.env, SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service",
    SUPABASE_DB_URL: u.toString(), ALLOWED_ORIGINS: "http://localhost:4175" }, stdio: "inherit" });
const cleanup = async () => { fn.kill(); await sql.end(); await admin.unsafe(`drop database if exists ${name}`).catch(() => {}); await admin.end(); process.exit(0); };
process.on("SIGTERM", cleanup); process.on("SIGINT", cleanup);

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (status, body) => { res.writeHead(status, { ...cors, "content-type": "application/json" }); res.end(body === undefined ? "" : JSON.stringify(body)); };
  if (req.method === "OPTIONS") return send(204);
  const token = (req.headers.authorization ?? "").replace("Bearer ", "");
  const user = USERS[token];
  if (url.pathname === "/auth/v1/user") return user ? send(200, { id: user[0], email: null }) : send(401, { msg: "bad jwt" });
  if (url.pathname.startsWith("/functions/v1/api/")) {
    const chunks = []; for await (const c of req) chunks.push(c);
    try {
      const r = await fetch(`http://127.0.0.1:8000/api/${url.pathname.slice(18)}`, { method: req.method,
        headers: { "content-type": "application/json", authorization: req.headers.authorization ?? "", origin: "http://localhost:4175" }, body: Buffer.concat(chunks) });
      return send(r.status, await r.json());
    } catch { return send(502, { error: "server-error" }); }
  }
  if (url.pathname === "/rest/v1/profiles") return send(200, user ? { display_name: user[1] } : null);
  if (url.pathname.startsWith("/rest/v1/")) return send(req.method === "GET" ? 200 : 201, req.method === "GET" ? [] : null);
  if (url.pathname === "/health") return send(200, { ok: true });
  send(404, {});
}).listen(54321, () => console.log("gateway on :54321"));
