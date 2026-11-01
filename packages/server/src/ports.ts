/* Ports: what the server use cases need from the outside world (manifest A2, A3). */
import type { Clock, Glicko, Pool } from "@sjakk/domain";

export interface RatingRow extends Glicko {
  userId: string; pool: Pool; games: number; wins: number; losses: number; streak: number; best: number; imported: boolean;
}
export interface PuzzleAttempt {
  userId: string; puzzleId: string; puzzleRating: number; solved: boolean; reason: string | null;
  ratingBefore: number; ratingAfter: number; createdAt: Date;
}
export interface GameRow {
  id?: string; kind: "bot" | "pvp"; status: "open" | "active" | "finished" | "aborted"; rated: boolean;
  timeControl: { m: number; i: number } | null; pool: Pool | null;
  whiteId: string | null; blackId: string | null; botRating: number | null; createdBy: string | null; clientId: string | null;
  startFen: string; result: "1-0" | "0-1" | "1/2-1/2" | null; reason: string | null; pgn: string | null;
  startedAt: Date | null; endedAt: Date | null;
  /** Person-vs-person only. */
  inviteCode?: string | null; creatorColor?: "w" | "b" | "random" | null; fen?: string | null; ply?: number;
  clock?: Clock | null; drawOffer?: "w" | "b" | null;
}
export interface MoveRow { gameId: string; ply: number; uci: string; san: string; fen: string; whiteMs: number | null; blackMs: number | null; createdAt: Date }
export interface GamePlayer { gameId: string; userId: string | null; color: "w" | "b"; ratingBefore: number | null; ratingAfter: number | null }

/** Repositories available inside one transaction. */
export interface Repos {
  ratings: {
    get(userId: string, pool: Pool): Promise<RatingRow | null>;
    put(row: RatingRow): Promise<void>;
    remove(userId: string, pool: Pool): Promise<void>;
  };
  puzzleAttempts: {
    has(userId: string, puzzleId: string): Promise<boolean>;
    add(a: PuzzleAttempt): Promise<void>;
    /** Newest first. */
    recent(userId: string, limit: number): Promise<PuzzleAttempt[]>;
    countSince(userId: string, since: Date): Promise<number>;
    removeAll(userId: string): Promise<void>;
  };
  games: {
    insert(g: GameRow): Promise<string>;
    byClientId(createdBy: string, clientId: string): Promise<GameRow | null>;
    addPlayer(p: GamePlayer): Promise<void>;
    players(gameId: string): Promise<GamePlayer[]>;
    /** With `lock`, the row is locked until the transaction ends, so moves are applied one at a time. */
    get(id: string, lock?: boolean): Promise<(GameRow & { id: string }) | null>;
    byCode(code: string): Promise<(GameRow & { id: string }) | null>;
    update(id: string, patch: Partial<GameRow>): Promise<void>;
    /** Display names for the given users. */
    names(userIds: string[]): Promise<Record<string, string>>;
    /** The user's open challenges and games in progress, newest first. */
    activeFor(userId: string): Promise<{ id: string; status: string; you: "w" | "b" | null; opponent: string | null; timeControl: { m: number; i: number } | null; inviteCode: string | null }[]>;
  };
  moves: {
    add(m: MoveRow): Promise<void>;
    list(gameId: string): Promise<MoveRow[]>;
  };
  account: {
    /** Everything stored about the user, for "download my data" (S11). */
    exportAll(userId: string): Promise<Record<string, unknown>>;
  };
}

export interface Store {
  /** Run `fn` in one transaction; everything or nothing is saved. */
  tx<T>(fn: (r: Repos) => Promise<T>): Promise<T>;
}

/** Puzzle data the server checks solutions against. */
export interface PuzzleSource { get(id: string): { id: string; fen: string; moves: string[]; rating: number } | null }

/** Deleting the login itself (Supabase Auth admin API). Deleting it cascades to all user rows. */
export interface AuthAdmin { deleteUser(userId: string): Promise<void> }

export interface TimeSource { now(): Date }

export interface Deps {
  store: Store; puzzles: PuzzleSource; auth: AuthAdmin; clock: TimeSource;
  /** A random invite code: 10 characters a–z0–9. */
  inviteCode(): string;
}
