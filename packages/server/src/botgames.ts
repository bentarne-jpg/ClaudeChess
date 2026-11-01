import { glickoUpdate, GLICKO_START, parsePgn, PgnError, terminalEval } from "@sjakk/domain";
import type { Body } from "@sjakk/contracts";
import { ApiError } from "./errors.ts";
import type { Deps, RatingRow } from "./ports.ts";

/** True when `side` has only a king, or a king and one knight or bishop: it cannot win on time. */
function cannotMate(fen: string, side: "w" | "b"): boolean {
  const pieces = fen.split(" ")[0]!.replace(/[^a-zA-Z]/g, "").split("").filter((p) => (p === p.toUpperCase()) === (side === "w"));
  const rest = pieces.map((p) => p.toLowerCase()).filter((p) => p !== "k");
  return rest.length === 0 || (rest.length === 1 && (rest[0] === "n" || rest[0] === "b"));
}

/** A bot is treated as a well-known opponent at its set strength. */
const BOT_RD = 50;

/**
 * Store a finished game against the bot and update the player's bot rating.
 * The moves must be legal and the stated ending must match the final position (manifest S4).
 */
export function finishBotGame(d: Deps, userId: string, b: Body<"bot-game/finish">) {
  let game;
  try { game = parsePgn(b.pgn); } catch (e) { throw new ApiError("illegal-game", e instanceof PgnError ? e.code : "parse"); }
  const finalFen = game.moves.at(-1)!.fen;
  const end = terminalEval(finalFen);
  const me = b.color, bot = me === "w" ? "b" : "w";
  const winFor = (c: "w" | "b") => (c === "w" ? "1-0" : "0-1") as "1-0" | "0-1";
  let result: "1-0" | "0-1" | "1/2-1/2";
  switch (b.reason) {
    case "checkmate":
      if (end?.mate !== 0 || !end.winner) throw new ApiError("illegal-game", "not checkmate");
      result = winFor(end.winner); break;
    case "stalemate": case "draw":
      if (!end?.draw) throw new ApiError("illegal-game", "not a draw");
      result = "1/2-1/2"; break;
    case "resign":
      if (end) throw new ApiError("illegal-game", "game was already over");
      result = winFor(bot); break; // only the player resigns
    case "timeout": {
      if (end || !b.flagged) throw new ApiError("illegal-game", "bad timeout");
      const other = b.flagged === "w" ? "b" : "w";
      result = cannotMate(finalFen, other) ? "1/2-1/2" : winFor(other); break;
    }
  }
  const score = result === "1/2-1/2" ? 0.5 : result === winFor(me) ? 1 : 0;
  const rated = game.moves.length >= 2;
  return d.store.tx(async (r) => {
    const dup = await r.games.byClientId(userId, b.clientId);
    if (dup) throw new ApiError("conflict", "Game already saved");
    const now = d.clock.now();
    const gameId = await r.games.insert({
      kind: "bot", status: "finished", rated, timeControl: b.timeControl, pool: "bot",
      whiteId: me === "w" ? userId : null, blackId: me === "b" ? userId : null, botRating: b.botRating,
      createdBy: userId, clientId: b.clientId, startFen: game.startFen, result, reason: b.reason, pgn: b.pgn,
      startedAt: null, endedAt: now,
    });
    let rating = null;
    if (rated) {
      const row: RatingRow = (await r.ratings.get(userId, "bot")) ?? {
        userId, pool: "bot", ...GLICKO_START, games: 0, wins: 0, losses: 0, streak: 0, best: GLICKO_START.rating, imported: false,
      };
      const g = glickoUpdate(row, [{ rating: b.botRating, rd: BOT_RD, score: score as 0 | 0.5 | 1 }]);
      await r.ratings.put({
        ...row, ...g, games: row.games + 1, wins: row.wins + (score === 1 ? 1 : 0), losses: row.losses + (score === 0 ? 1 : 0),
        streak: score === 1 ? row.streak + 1 : 0, best: Math.max(row.best, g.rating),
      });
      await r.games.addPlayer({ gameId, userId, color: me, ratingBefore: row.rating, ratingAfter: g.rating });
      rating = { pool: "bot", before: Math.round(row.rating), after: Math.round(g.rating) };
    }
    return { gameId, result, rated, rating };
  });
}
