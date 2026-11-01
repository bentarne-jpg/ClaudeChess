/*
 * The real Edge Function over HTTP (manifest T4): Deno runs supabase/functions/api against a fresh
 * Postgres, with a stand-in for Supabase Auth that knows two tokens. CI also runs this on the full
 * Supabase stack.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALICE, BOB, freshDatabase } from "./fixtures.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const DENO = resolve(ROOT, "node_modules/.bin/deno");
const ready = existsSync(DENO) && existsSync(resolve(ROOT, "supabase/functions/_shared/server/index.ts"));
const db = ready ? await freshDatabase() : null;
const TOKENS: Record<string, string> = { "token-alice": ALICE, "token-bob": BOB };

let auth: Server, fn: ChildProcess;
const API = "http://127.0.0.1:8000/api";

beforeAll(async () => {
  if (!db) return;
  auth = createServer((req, res) => {
    const id = TOKENS[(req.headers.authorization ?? "").replace("Bearer ", "")];
    res.writeHead(id ? 200 : 401, { "content-type": "application/json" }).end(JSON.stringify(id ? { id } : { msg: "bad jwt" }));
  });
  await new Promise<void>((r) => auth.listen(54390, "127.0.0.1", r));
  fn = spawn(DENO, ["run", "--allow-net", "--allow-env", "--allow-read", `--config=${ROOT}/supabase/functions/api/deno.json`, `${ROOT}/supabase/functions/api/index.ts`], {
    env: { ...process.env, SUPABASE_URL: "http://127.0.0.1:54390", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", SUPABASE_DB_URL: db.url },
    stdio: ["ignore", "pipe", "pipe"],
  });
  fn.stderr!.on("data", (d) => process.stderr.write(d));
  for (let i = 0; i < 300; i++) {
    try { await fetch(API, { method: "OPTIONS" }); return; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  throw new Error("function did not start");
}, 90_000);

afterAll(async () => { fn?.kill(); auth?.close(); await db?.drop(); });

const post = (route: string, body: unknown, token?: string, origin = "https://bentarne-jpg.github.io") =>
  fetch(`${API}/${route}`, { method: "POST", headers: { "content-type": "application/json", Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

describe.skipIf(!db)("api Edge Function over HTTP", () => {
  it("answers CORS preflight for the app's origin only", async () => {
    const r = await fetch(`${API}/puzzle/start`, { method: "OPTIONS", headers: { Origin: "https://bentarne-jpg.github.io" } });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("https://bentarne-jpg.github.io");
    const evil = await fetch(`${API}/puzzle/start`, { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
    expect(evil.headers.get("access-control-allow-origin")).not.toBe("https://evil.example");
  });

  it("refuses callers without a valid login", async () => {
    expect((await post("puzzle/profile", {})).status).toBe(401);
    expect((await post("puzzle/profile", {}, "forged")).status).toBe(401);
  });

  it("runs a puzzle round trip against the real puzzle set and database", async () => {
    expect(await (await post("puzzle/start", { level: 1200 }, "token-alice")).json()).toMatchObject({ profile: { rating: 1200 } });
    // Puzzle 0CBPG from the bundled set: the opponent plays f7c7, the solution is d3d8.
    const ok = await post("puzzle/result", { puzzleId: "0CBPG", solved: true, moves: ["d3d8"] }, "token-alice");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ rated: true, profile: { games: 1, solved: 1 } });
    const bad = await post("puzzle/result", { puzzleId: "08yJ9", solved: true, moves: ["d1d2"] }, "token-alice");
    expect(await bad.json()).toMatchObject({ error: "not-solved" });
    const rows = await db!.sql`select user_id, games from public.ratings where pool = 'puzzle'`;
    expect(rows).toEqual([{ user_id: ALICE, games: 1 }]);
  });

  it("stores a bot game for the caller only", async () => {
    const r = await post("bot-game/finish", { clientId: "b_x", pgn: "1. f3 e5 2. g4 Qh4#", color: "b", botRating: 1000, timeControl: null, reason: "checkmate" }, "token-bob");
    expect(await r.json()).toMatchObject({ result: "0-1", rated: true });
    const g = await db!.sql`select black_id, white_id from public.games`;
    expect(g).toEqual([{ black_id: BOB, white_id: null }]);
  });

  it("plays a person-vs-person game between two logins", async () => {
    const c = (await (await post("pvp/create", { timeControl: { m: 3, i: 2 }, color: "w", rated: true }, "token-alice")).json()) as { id: string; inviteCode: string };
    expect(c).toMatchObject({ status: "open", you: "w" });
    expect(c.inviteCode).toMatch(/^[a-z0-9]{10}$/);
    expect(await (await post("pvp/accept", { code: c.inviteCode }, "token-bob")).json()).toMatchObject({ status: "active", you: "b" });
    const plies = ["f2f3", "e7e5", "g2g4", "d8h4"];
    let s;
    for (let i = 0; i < plies.length; i++) s = await (await post("pvp/move", { gameId: c.id, uci: plies[i], ply: i + 1 }, i % 2 ? "token-bob" : "token-alice")).json();
    expect(s).toMatchObject({ status: "finished", result: "0-1", reason: "checkmate" });
    expect(await db!.sql`select count(*)::int as n from public.moves where game_id = ${c.id}`).toEqual([{ n: 4 }]);
  });

  it("rejects malformed and oversized bodies", async () => {
    const r = await fetch(`${API}/puzzle/start`, { method: "POST", headers: { Authorization: "Bearer token-alice" }, body: "{" });
    expect(r.status).toBe(400);
    const big = await post("bot-game/finish", { pgn: "x".repeat(300_000) }, "token-alice");
    expect(big.status).toBe(413);
  });
});
