/*
 * Every message between the app and the server, as zod schemas (manifest A6, S6).
 * Both sides validate with these; the server never trusts anything it has not parsed here.
 */
import { z } from "zod";

const uci = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
export const TimeControl = z.object({ m: z.number().min(0.25).max(180), i: z.number().int().min(0).max(180) }).strict();

// ---- puzzles ----
export const PUZZLE_LEVELS = [800, 1200, 1600, 2000] as const;
export const PuzzleStart = z.object({ level: z.union([z.literal(800), z.literal(1200), z.literal(1600), z.literal(2000)]) }).strict();
export const PuzzleResult = z.object({
  puzzleId: z.string().min(1).max(20),
  solved: z.boolean(),
  /** The moves the player made, in order (only checked when solved). */
  moves: z.array(uci).max(20),
  reason: z.enum(["løst", "feil trekk", "hint", "viste løsning", "ikke løst"]).optional(),
}).strict();
export const PuzzleProfile = z.object({
  rating: z.number(), games: z.number().int(), solved: z.number().int(), failed: z.number().int(),
  streak: z.number().int(), best: z.number(), hist: z.array(z.number()), seen: z.array(z.string()),
  log: z.array(z.object({ r: z.number(), d: z.number(), win: z.boolean(), why: z.string() })),
  updated: z.number(),
});
export type PuzzleProfile = z.infer<typeof PuzzleProfile>;
export const PuzzleResultReply = z.object({ profile: PuzzleProfile, delta: z.number(), rated: z.boolean() });

// ---- bot games ----
export const BOT_END_REASONS = ["checkmate", "stalemate", "draw", "resign", "timeout"] as const;
export const BotGameFinish = z.object({
  clientId: z.string().min(1).max(80),
  pgn: z.string().min(1).max(200_000),
  color: z.enum(["w", "b"]),
  botRating: z.number().int().min(400).max(3200),
  timeControl: TimeControl.nullable(),
  reason: z.enum(BOT_END_REASONS),
  /** Only for reason "timeout": who ran out of time. */
  flagged: z.enum(["w", "b"]).optional(),
}).strict();
export const RatingChange = z.object({ pool: z.string(), before: z.number(), after: z.number() });
export const BotGameReply = z.object({ gameId: z.string(), result: z.string(), rated: z.boolean(), rating: RatingChange.nullable() });

// ---- account ----
export const ImportLocal = z.object({
  puzzle: z.object({
    rating: z.number().min(100).max(4000), games: z.number().int().min(0).max(1_000_000),
    solved: z.number().int().min(0), failed: z.number().int().min(0), best: z.number().min(100).max(4000),
    seen: z.array(z.string().max(20)).max(600).optional(),
  }).strict(),
}).strict();
export const DeleteAccount = z.object({ confirm: z.literal("SLETT") }).strict();
export const Empty = z.object({}).strict();

// ---- person vs person ----
const gameId = z.string().uuid();
const inviteCode = z.string().regex(/^[a-z0-9]{10}$/);
export const PvpCreate = z.object({ timeControl: TimeControl.nullable(), color: z.enum(["w", "b", "random"]), rated: z.boolean() }).strict();
export const PvpCode = z.object({ code: inviteCode }).strict();
export const PvpGame = z.object({ gameId }).strict();
export const PvpMove = z.object({ gameId, uci, ply: z.number().int().min(1).max(1000) }).strict();
export const PvpDraw = z.object({ gameId, action: z.enum(["offer", "accept", "decline"]) }).strict();
export const PvpState = z.object({
  id: z.string(), status: z.enum(["open", "active", "finished", "aborted"]), rated: z.boolean(),
  timeControl: TimeControl.nullable(), pool: z.string().nullable(),
  white: z.object({ id: z.string().nullable(), name: z.string() }), black: z.object({ id: z.string().nullable(), name: z.string() }),
  you: z.enum(["w", "b"]).nullable(), startFen: z.string(), fen: z.string(), ply: z.number().int(),
  moves: z.array(z.object({ uci: z.string(), san: z.string() })),
  /** Milliseconds left for each side at `serverNow`; `running` is the side whose clock runs. */
  clock: z.object({ w: z.number(), b: z.number(), running: z.enum(["w", "b"]).nullable(), serverNow: z.number() }).nullable(),
  drawOffer: z.enum(["w", "b"]).nullable(), result: z.string().nullable(), reason: z.string().nullable(),
  inviteCode: z.string().nullable(),
  ratingChange: z.object({ w: RatingChange.nullable(), b: RatingChange.nullable() }).nullable(),
});
export type PvpState = z.infer<typeof PvpState>;

export const ROUTES = {
  "puzzle/start": PuzzleStart,
  "puzzle/result": PuzzleResult,
  "puzzle/reset": Empty,
  "puzzle/profile": Empty,
  "bot-game/finish": BotGameFinish,
  "account/import": ImportLocal,
  "account/export": Empty,
  "account/delete": DeleteAccount,
  "account/stats": Empty,
  "pvp/create": PvpCreate,
  "pvp/info": PvpCode,
  "pvp/accept": PvpCode,
  "pvp/state": PvpGame,
  "pvp/move": PvpMove,
  "pvp/resign": PvpGame,
  "pvp/draw": PvpDraw,
  "pvp/claim-timeout": PvpGame,
  "pvp/abort": PvpGame,
  "pvp/list": Empty,
} as const;
export type Route = keyof typeof ROUTES;
export type Body<R extends Route> = z.infer<(typeof ROUTES)[R]>;

/** Error codes the server returns as `{ error: code }`. */
export type ApiErrorCode =
  | "bad-request" | "unauthorized" | "not-found" | "conflict" | "rate-limited"
  | "no-profile" | "not-solved" | "illegal-game" | "server-error"
  | "not-your-turn" | "illegal-move" | "game-over" | "forbidden";
