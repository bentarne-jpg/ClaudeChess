/* Client-side use cases for games against a friend (phase 3). The server is the referee. */
import type { Body, PvpState } from "@sjakk/contracts";
import type { ApiPort } from "./account.ts";

/** Pushes "something changed in this game" (Supabase Realtime); the client then fetches the state. */
export interface LivePort { watch(gameId: string, onChange: () => void): () => void }

export interface ChallengeInfo { gameId: string; status: string; from: string; timeControl: { m: number; i: number } | null; rated: boolean; color: string; yours: boolean }
export interface ListedGame { id: string; status: string; you: "w" | "b" | null; opponent: string | null; timeControl: { m: number; i: number } | null; inviteCode: string | null }

export function createOnline(api: ApiPort) {
  const st = (p: Promise<unknown>) => p as Promise<PvpState>;
  return {
    create: (b: Body<"pvp/create">) => st(api.call("pvp/create", b)),
    info: (code: string) => api.call("pvp/info", { code }) as Promise<ChallengeInfo>,
    accept: (code: string) => st(api.call("pvp/accept", { code })),
    state: (gameId: string) => st(api.call("pvp/state", { gameId })),
    move: (gameId: string, uci: string, ply: number) => st(api.call("pvp/move", { gameId, uci, ply })),
    resign: (gameId: string) => st(api.call("pvp/resign", { gameId })),
    draw: (gameId: string, action: "offer" | "accept" | "decline") => st(api.call("pvp/draw", { gameId, action })),
    claimTimeout: (gameId: string) => st(api.call("pvp/claim-timeout", { gameId })),
    abort: (gameId: string) => st(api.call("pvp/abort", { gameId })),
    list: async () => ((await api.call("pvp/list", {})) as { games: ListedGame[] }).games,
  };
}
export type Online = ReturnType<typeof createOnline>;

/**
 * Time left on each clock now, from the server's figures. `receivedAt` is when the state arrived on
 * this device; only the running side's clock counts down from then.
 */
export function clocksNow(s: PvpState, receivedAt: number, now: number): { w: number; b: number } | null {
  if (!s.clock) return null;
  const spent = s.status === "active" && s.clock.running ? Math.max(0, now - receivedAt) : 0;
  return {
    w: Math.max(0, s.clock.w - (s.clock.running === "w" ? spent : 0)),
    b: Math.max(0, s.clock.b - (s.clock.running === "b" ? spent : 0)),
  };
}

/** One line telling the player what is going on. */
export function statusText(s: PvpState): string {
  const name = (c: "w" | "b") => (c === s.you ? "Du" : (c === "w" ? s.white.name : s.black.name));
  if (s.status === "open") return "Venter på at vennen din godtar invitasjonen.";
  if (s.status === "aborted") return "Partiet ble avbrutt.";
  if (s.status === "finished") {
    const why: Record<string, string> = { checkmate: "sjakkmatt", resign: "oppgitt", timeout: "tiden gikk ut", agreement: "remis etter avtale",
      stalemate: "patt", repetition: "trekkgjentakelse", insufficient: "for lite materiale", "fifty-moves": "50-trekksregelen" };
    const res = s.result === "1/2-1/2" ? "Remis" : s.result === "1-0" ? `${name("w")} vant` : `${name("b")} vant`;
    return `${res} (${why[s.reason ?? ""] ?? s.reason}).`;
  }
  const turn = s.fen.split(" ")[1] as "w" | "b";
  if (s.drawOffer && s.drawOffer !== s.you) return "Motstanderen tilbyr remis.";
  return turn === s.you ? "Din tur." : `Venter på ${turn === "w" ? s.white.name : s.black.name}.`;
}
