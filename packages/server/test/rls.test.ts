/* Row-level security and grants, checked as the real client roles would see them (manifest S3, S5). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { ALICE, BOB, freshDatabase } from "./fixtures.ts";

const db = await freshDatabase();
afterAll(async () => { await db?.drop(); });

/** Run `fn` as a signed-in user (role `authenticated`, JWT subject = user). */
async function as<T>(sql: postgres.Sql, user: string | null, fn: (t: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (t) => {
    await t.unsafe(`set local role ${user ? "authenticated" : "anon"}`);
    if (user) await t`select set_config('request.jwt.claim.sub', ${user}, true)`;
    return fn(t);
  }) as Promise<T>;
}

describe.skipIf(!db)("row-level security", () => {
  const sql = db?.sql as postgres.Sql;
  beforeAll(async () => {
    await sql`insert into public.ratings (user_id, pool, rating, best) values (${ALICE}, 'puzzle', 1200, 1200), (${BOB}, 'puzzle', 1800, 1800)`;
    await sql`insert into public.games (kind, status, white_id, result) values ('bot', 'finished', ${ALICE}, '1-0'), ('bot', 'finished', ${BOB}, '0-1')`;
  });

  it("creates a profile named from the login provider", async () => {
    const rows = await sql`select id, display_name from public.profiles order by display_name`;
    expect(rows.map((r) => r.display_name)).toEqual(["Alice", "Bob"]);
  });

  it("lets users read only their own ratings and games", async () => {
    const r = await as(sql, ALICE, (t) => t`select user_id from public.ratings`);
    expect(r.map((x) => x.user_id)).toEqual([ALICE]);
    const g = await as(sql, ALICE, (t) => t`select white_id from public.games`);
    expect(g.map((x) => x.white_id)).toEqual([ALICE]);
  });

  it("never lets clients write ratings, attempts or games", async () => {
    await expect(as(sql, ALICE, (t) => t`update public.ratings set rating = 3000 where user_id = ${ALICE}`)).rejects.toThrow(/permission denied/);
    await expect(as(sql, ALICE, (t) => t`insert into public.ratings (user_id, pool, rating, best) values (${ALICE}, 'bot', 3000, 3000)`)).rejects.toThrow(/permission denied/);
    await expect(as(sql, ALICE, (t) => t`insert into public.puzzle_attempts (user_id, puzzle_id, puzzle_rating, solved, rating_before, rating_after) values (${ALICE}, 'x', 1, true, 1, 1)`)).rejects.toThrow(/permission denied/);
    await expect(as(sql, ALICE, (t) => t`update public.games set result = '1-0'`)).rejects.toThrow(/permission denied/);
  });

  it("gives anonymous visitors nothing", async () => {
    await expect(as(sql, null, (t) => t`select * from public.ratings`)).rejects.toThrow(/permission denied/);
    await expect(as(sql, null, (t) => t`select * from public.user_docs`)).rejects.toThrow(/permission denied/);
  });

  it("lets users keep their own documents but not reserved or others' ones", async () => {
    await as(sql, ALICE, (t) => t`insert into public.user_docs (user_id, name, data) values (${ALICE}, 'botgame', ${t.json({ kind: "botgame" })})`);
    await expect(as(sql, ALICE, (t) => t`insert into public.user_docs (user_id, name, data) values (${BOB}, 'botgame', '{}')`)).rejects.toThrow(/row-level security/);
    await expect(as(sql, ALICE, (t) => t`insert into public.user_docs (user_id, name, data) values (${ALICE}, 'puzzleprofile', '{}')`)).rejects.toThrow(/check constraint/);
    const bobSees = await as(sql, BOB, (t) => t`select * from public.user_docs`);
    expect(bobSees).toEqual([]);
  });

  it("lets users pick one of the app's avatars, nothing else", async () => {
    await as(sql, ALICE, (t) => t`update public.profiles set avatar = 'piece:wn:green' where id = ${ALICE}`);
    await expect(as(sql, ALICE, (t) => t`update public.profiles set avatar = 'https://evil.example/x.png' where id = ${ALICE}`)).rejects.toThrow(/check constraint/);
    await expect(as(sql, ALICE, (t) => t`update public.profiles set created_at = now() where id = ${ALICE}`)).rejects.toThrow(/permission denied/);
  });

  it("lets users rename themselves only", async () => {
    await as(sql, ALICE, (t) => t`update public.profiles set display_name = 'Ali' where id = ${ALICE}`);
    await as(sql, ALICE, (t) => t`update public.profiles set display_name = 'Hacked' where id = ${BOB}`);
    const names = await sql`select display_name from public.profiles order by display_name`;
    expect(names.map((r) => r.display_name)).toEqual(["Ali", "Bob"]);
  });

  it("removes a user's own data when the login is deleted, keeping games for the opponent", async () => {
    await sql`delete from auth.users where id = ${BOB}`;
    expect(await sql`select 1 from public.ratings where user_id = ${BOB}`).toHaveLength(0);
    expect((await sql`select white_id from public.games where result = '0-1'`)[0]!.white_id).toBeNull();
  });
});
