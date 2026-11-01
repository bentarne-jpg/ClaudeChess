/*
 * Person-vs-person games (phase 3). The server is the referee (manifest S4): it checks every move,
 * keeps both clocks on its own time, decides the result and computes the ratings (S5).
 */
import { Chess } from "chess.js";
import { clockAfterMove, glickoUpdate, GLICKO_START, newClock, poolFor, syncClock, terminalEval, timeLeft, type Clock } from "@sjakk/domain";
import type { Body, PvpState } from "@sjakk/contracts";
import { ApiError } from "./errors.ts";
import type { Deps, GameRow, Repos } from "./ports.ts";

type Game = GameRow & { id: string };
type Color = "w" | "b";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const other = (c: Color): Color => (c === "w" ? "b" : "w");
const winFor = (c: Color) => (c === "w" ? "1-0" : "0-1") as "1-0" | "0-1";

const colorOf = (g: Game, userId: string): Color | null => (g.whiteId === userId ? "w" : g.blackId === userId ? "b" : null);

/** Side `side` has only a king, or king and one minor piece: it cannot win on time. */
function cannotMate(fen: string, side: Color): boolean {
  const rest = fen.split(" ")[0]!.replace(/[^a-zA-Z]/g, "").split("")
    .filter((p) => (p === p.toUpperCase()) === (side === "w")).map((p) => p.toLowerCase()).filter((p) => p !== "k");
  return rest.length === 0 || (rest.length === 1 && (rest[0] === "n" || rest[0] === "b"));
}

async function state(r: Repos, g: Game, userId: string, nowMs: number, ratingChange: PvpState["ratingChange"] = null): Promise<PvpState> {
  const moves = await r.moves.list(g.id);
  const names = await r.games.names([g.whiteId, g.blackId].filter((x): x is string => !!x));
  const c = g.clock ?? null;
  if (!ratingChange && g.status === "finished" && g.rated) {
    const ps = await r.games.players(g.id);
    const rc = (col: Color) => { const p = ps.find((x) => x.color === col); return p && p.ratingBefore != null && p.ratingAfter != null
      ? { pool: g.pool ?? "", before: Math.round(p.ratingBefore), after: Math.round(p.ratingAfter) } : null; };
    if (ps.length) ratingChange = { w: rc("w"), b: rc("b") };
  }
  return {
    id: g.id, status: g.status, rated: g.rated, timeControl: g.timeControl, pool: g.pool,
    white: { id: g.whiteId, name: g.whiteId ? names[g.whiteId] ?? "Spiller" : "Venter …" },
    black: { id: g.blackId, name: g.blackId ? names[g.blackId] ?? "Spiller" : "Venter …" },
    you: colorOf(g, userId), startFen: g.startFen, fen: g.fen ?? g.startFen, ply: g.ply ?? 0,
    moves: moves.map((m) => ({ uci: m.uci, san: m.san })),
    clock: c ? { w: Math.max(0, timeLeft(c, "w", nowMs)), b: Math.max(0, timeLeft(c, "b", nowMs)), running: c.running, serverNow: nowMs } : null,
    drawOffer: g.drawOffer ?? null, result: g.result, reason: g.reason,
    inviteCode: g.status === "open" && g.createdBy === userId ? g.inviteCode ?? null : null,
    ratingChange,
  };
}

async function load(r: Repos, id: string, userId: string, lock = true): Promise<Game> {
  const g = await r.games.get(id, lock);
  if (!g || !colorOf(g, userId) && g.createdBy !== userId) throw new ApiError("not-found", "No such game");
  return g;
}

/** End the game: store the result and PGN, and rate both players in the game's pool. */
async function finish(r: Repos, g: Game, result: "1-0" | "0-1" | "1/2-1/2", reason: string, now: Date): Promise<PvpState["ratingChange"]> {
  const moves = await r.moves.list(g.id);
  const c = new Chess(g.startFen);
  for (const m of moves) c.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] });
  const head = [`[Event "Parti mot venn"]`, `[Date "${now.toISOString().slice(0, 10).replace(/-/g, ".")}"]`, `[Result "${result}"]`];
  if (g.timeControl) head.push(`[TimeControl "${Math.round(g.timeControl.m * 60)}+${g.timeControl.i}"]`);
  const pgn = head.join("\n") + "\n\n" + (c.pgn({ max_width: 0 }).replace(/^\[.*\]\s*/gm, "").trim() + " " + result).trim();
  const clock = g.clock ? syncClock(g.clock, { ply: g.ply ?? 0, turn: "w", over: true }, now.getTime()) : null;
  await r.games.update(g.id, { status: "finished", result, reason, pgn, endedAt: now, clock, drawOffer: null });
  if (!g.rated || (g.ply ?? 0) < 2 || !g.whiteId || !g.blackId || !g.pool) return null;
  const [w, b] = await Promise.all([r.ratings.get(g.whiteId, g.pool), r.ratings.get(g.blackId, g.pool)]);
  const fresh = (userId: string) => ({ userId, pool: g.pool!, ...GLICKO_START, games: 0, wins: 0, losses: 0, streak: 0, best: GLICKO_START.rating, imported: false });
  const W = w ?? fresh(g.whiteId), B = b ?? fresh(g.blackId);
  const sw = result === "1-0" ? 1 : result === "0-1" ? 0 : 0.5;
  const nw = glickoUpdate(W, [{ rating: B.rating, rd: B.rd, score: sw }]);
  const nb = glickoUpdate(B, [{ rating: W.rating, rd: W.rd, score: (1 - sw) as 0 | 0.5 | 1 }]);
  const save = async (old: typeof W, n: typeof nw, score: number, color: Color) => {
    await r.ratings.put({ ...old, ...n, games: old.games + 1, wins: old.wins + (score === 1 ? 1 : 0), losses: old.losses + (score === 0 ? 1 : 0),
      streak: score === 1 ? old.streak + 1 : 0, best: Math.max(old.best, n.rating) });
    await r.games.addPlayer({ gameId: g.id, userId: old.userId, color, ratingBefore: old.rating, ratingAfter: n.rating });
  };
  await save(W, nw, sw, "w");
  await save(B, nb, 1 - sw, "b");
  return { w: { pool: g.pool, before: Math.round(W.rating), after: Math.round(nw.rating) }, b: { pool: g.pool, before: Math.round(B.rating), after: Math.round(nb.rating) } };
}

/** If the side to move has run out of time, end the game now. Returns the rating change when it ended. */
async function flagIfOut(r: Repos, g: Game, now: Date): Promise<boolean> {
  if (g.status !== "active" || !g.clock) return false;
  const turn = (g.fen ?? g.startFen).split(" ")[1] as Color;
  if (timeLeft(g.clock, turn, now.getTime()) > 0) return false;
  const winner = other(turn);
  await finish(r, g, cannotMate(g.fen ?? g.startFen, winner) ? "1/2-1/2" : winFor(winner), "timeout", now);
  return true;
}

export function createChallenge(d: Deps, userId: string, b: Body<"pvp/create">) {
  return d.store.tx(async (r) => {
    const id = await r.games.insert({
      kind: "pvp", status: "open", rated: b.rated, timeControl: b.timeControl, pool: poolFor(b.timeControl),
      whiteId: b.color === "w" ? userId : null, blackId: b.color === "b" ? userId : null, botRating: null,
      createdBy: userId, clientId: null, startFen: START, result: null, reason: null, pgn: null, startedAt: null, endedAt: null,
      inviteCode: d.inviteCode(), creatorColor: b.color, fen: START, ply: 0, clock: null, drawOffer: null,
    });
    return state(r, (await r.games.get(id))!, userId, d.clock.now().getTime());
  });
}

export function challengeInfo(d: Deps, userId: string, b: Body<"pvp/info">) {
  return d.store.tx(async (r) => {
    const g = await r.games.byCode(b.code);
    if (!g) throw new ApiError("not-found", "No such challenge");
    const names = await r.games.names([g.createdBy!]);
    return { gameId: g.id, status: g.status, from: names[g.createdBy!] ?? "Spiller", timeControl: g.timeControl, rated: g.rated,
      color: g.creatorColor, yours: g.createdBy === userId };
  });
}

export function acceptChallenge(d: Deps, userId: string, b: Body<"pvp/accept">) {
  return d.store.tx(async (r) => {
    const found = await r.games.byCode(b.code);
    if (!found) throw new ApiError("not-found", "No such challenge");
    const g = (await r.games.get(found.id, true))!;
    if (g.status === "open" && g.createdBy === userId) throw new ApiError("conflict", "You cannot accept your own challenge");
    if (colorOf(g, userId)) return state(r, g, userId, d.clock.now().getTime()); // already in it
    if (g.status !== "open") throw new ApiError("conflict", "Challenge already taken");
    let white = g.whiteId, black = g.blackId;
    if (g.creatorColor === "random") { const creatorWhite = d.inviteCode().charCodeAt(0) % 2 === 0; white = creatorWhite ? g.createdBy : userId; black = creatorWhite ? userId : g.createdBy; }
    else if (white) black = userId; else white = userId;
    const now = d.clock.now();
    await r.games.update(g.id, { status: "active", whiteId: white, blackId: black, startedAt: now, clock: newClock(g.timeControl), inviteCode: null });
    return state(r, (await r.games.get(g.id))!, userId, now.getTime());
  });
}

export function gameState(d: Deps, userId: string, b: Body<"pvp/state">) {
  return d.store.tx(async (r) => {
    const g = await load(r, b.gameId, userId);
    const now = d.clock.now();
    if (await flagIfOut(r, g, now)) return state(r, (await r.games.get(g.id))!, userId, now.getTime());
    return state(r, g, userId, now.getTime());
  });
}

export function makeMove(d: Deps, userId: string, b: Body<"pvp/move">) {
  return d.store.tx(async (r) => {
    const g = await load(r, b.gameId, userId);
    const me = colorOf(g, userId);
    const now = d.clock.now();
    if (g.status !== "active") throw new ApiError("game-over");
    if (await flagIfOut(r, g, now)) return state(r, (await r.games.get(g.id))!, userId, now.getTime());
    const c = new Chess(g.fen ?? g.startFen);
    if (c.turn() !== me) throw new ApiError("not-your-turn");
    if (b.ply !== (g.ply ?? 0) + 1) throw new ApiError("conflict", "Out of date; reload the game");
    const m = c.move({ from: b.uci.slice(0, 2), to: b.uci.slice(2, 4), promotion: b.uci[4] });
    if (!m) throw new ApiError("illegal-move");
    const ply = b.ply, fen = c.fen();
    let clock: Clock | null = g.clock ?? null;
    if (clock) clock = clockAfterMove(clock, me!, { ply, turn: c.turn(), over: false }, now.getTime());
    await r.moves.add({ gameId: g.id, ply, uci: b.uci, san: m.san, fen, whiteMs: clock ? Math.round(clock.w) : null, blackMs: clock ? Math.round(clock.b) : null, createdAt: now });
    // A move declines the opponent's draw offer; your own offer stands for one move.
    await r.games.update(g.id, { fen, ply, clock, drawOffer: g.drawOffer === me ? me : null });
    const end = terminalEval(fen);
    let ratingChange = null;
    if (end) {
      const after = { ...g, fen, ply, clock };
      ratingChange = await finish(r, after, end.mate === 0 && end.winner ? winFor(end.winner) : "1/2-1/2",
        end.mate === 0 ? "checkmate" : c.in_stalemate() ? "stalemate" : c.in_threefold_repetition() ? "repetition" : c.insufficient_material() ? "insufficient" : "fifty-moves", now);
    }
    return state(r, (await r.games.get(g.id))!, userId, now.getTime(), ratingChange);
  });
}

export function resign(d: Deps, userId: string, b: Body<"pvp/resign">) {
  return d.store.tx(async (r) => {
    const g = await load(r, b.gameId, userId);
    if (g.status !== "active") throw new ApiError("game-over");
    const now = d.clock.now();
    const rc = await finish(r, g, winFor(other(colorOf(g, userId)!)), "resign", now);
    return state(r, (await r.games.get(g.id))!, userId, now.getTime(), rc);
  });
}

export function draw(d: Deps, userId: string, b: Body<"pvp/draw">) {
  return d.store.tx(async (r) => {
    const g = await load(r, b.gameId, userId);
    if (g.status !== "active") throw new ApiError("game-over");
    const me = colorOf(g, userId)!, now = d.clock.now();
    let rc = null;
    if (b.action === "offer") await r.games.update(g.id, { drawOffer: me });
    else if (g.drawOffer !== other(me)) throw new ApiError("conflict", "No draw offer to answer");
    else if (b.action === "accept") rc = await finish(r, g, "1/2-1/2", "agreement", now);
    else await r.games.update(g.id, { drawOffer: null });
    return state(r, (await r.games.get(g.id))!, userId, now.getTime(), rc);
  });
}

export function claimTimeout(d: Deps, userId: string, b: Body<"pvp/claim-timeout">) {
  return d.store.tx(async (r) => {
    const g = await load(r, b.gameId, userId);
    const now = d.clock.now();
    if (!(await flagIfOut(r, g, now))) throw new ApiError("conflict", "Time has not run out");
    return state(r, (await r.games.get(g.id))!, userId, now.getTime());
  });
}

/** Cancel an open challenge, or abort a game before both sides have moved (not rated). */
export function abort(d: Deps, userId: string, b: Body<"pvp/abort">) {
  return d.store.tx(async (r) => {
    const g = await load(r, b.gameId, userId);
    if (g.status === "open" ? g.createdBy !== userId : g.status !== "active" || (g.ply ?? 0) >= 2) throw new ApiError("conflict", "Too late to abort");
    const now = d.clock.now();
    await r.games.update(g.id, { status: "aborted", endedAt: now, inviteCode: null, clock: g.clock ? syncClock(g.clock, { ply: 0, turn: "w", over: true }, now.getTime()) : null });
    return state(r, (await r.games.get(g.id))!, userId, now.getTime());
  });
}

export function myGames(d: Deps, userId: string) {
  return d.store.tx(async (r) => ({ games: await r.games.activeFor(userId) }));
}
