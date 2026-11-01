/* In-memory adapter for tests (manifest T2/T3). Transactions copy state and commit on success. */
import type { GamePlayer, GameRow, MoveRow, PuzzleAttempt, RatingRow, Repos, Store } from "./ports.ts";

export interface State { ratings: RatingRow[]; attempts: PuzzleAttempt[]; games: (GameRow & { id: string })[]; players: GamePlayer[]; moves: MoveRow[]; names: Record<string, string> }

export function memoryStore(): Store & { state: State } {
  const s: { state: State } = { state: { ratings: [], attempts: [], games: [], players: [], moves: [], names: {} } };
  let n = 0;
  const repos = (st: State): Repos => ({
    ratings: {
      async get(u, p) { const r = st.ratings.find((x) => x.userId === u && x.pool === p); return r ? { ...r } : null; },
      async put(row) { st.ratings = st.ratings.filter((x) => !(x.userId === row.userId && x.pool === row.pool)).concat({ ...row }); },
      async remove(u, p) { st.ratings = st.ratings.filter((x) => !(x.userId === u && x.pool === p)); },
    },
    puzzleAttempts: {
      async has(u, id) { return st.attempts.some((a) => a.userId === u && a.puzzleId === id); },
      async add(a) {
        if (st.attempts.some((x) => x.userId === a.userId && x.puzzleId === a.puzzleId)) throw new Error("duplicate attempt");
        st.attempts.push({ ...a });
      },
      async recent(u, limit) { return st.attempts.filter((a) => a.userId === u).reverse().slice(0, limit); },
      async countSince(u, since) { return st.attempts.filter((a) => a.userId === u && a.createdAt >= since).length; },
      async removeAll(u) { st.attempts = st.attempts.filter((a) => a.userId !== u); },
    },
    games: {
      async insert(g) {
        if (g.inviteCode && st.games.some((x) => x.inviteCode === g.inviteCode)) throw new Error("duplicate invite code");
        const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`; st.games.push({ ...structuredClone(g), id }); return id;
      },
      async byClientId(u, c) { return st.games.find((g) => g.createdBy === u && g.clientId === c) ?? null; },
      async addPlayer(p) { st.players.push({ ...p }); },
      async players(id) { return st.players.filter((p) => p.gameId === id); },
      async get(id) { const g = st.games.find((x) => x.id === id); return g ? structuredClone(g) : null; },
      async byCode(code) { const g = st.games.find((x) => x.inviteCode === code); return g ? structuredClone(g) : null; },
      async update(id, patch) {
        if (patch.inviteCode && st.games.some((x) => x.id !== id && x.inviteCode === patch.inviteCode)) throw new Error("duplicate invite code");
        const allowed = ["status", "whiteId", "blackId", "result", "reason", "pgn", "startedAt", "endedAt", "inviteCode", "fen", "ply", "clock", "drawOffer"];
        for (const k of Object.keys(patch)) if (!allowed.includes(k)) throw new Error(`games.update: ${k} cannot be changed`);
        const g = st.games.find((x) => x.id === id); if (g) Object.assign(g, structuredClone(patch));
      },
      async names(ids) { return Object.fromEntries(ids.map((i) => [i, st.names[i] ?? "Spiller"])); },
      async activeFor(u) {
        return st.games.filter((g) => g.kind === "pvp" && (g.status === "active" || (g.status === "open" && g.createdBy === u)) && (g.whiteId === u || g.blackId === u))
          .reverse().map((g) => {
            const you = g.whiteId === u ? "w" as const : "b" as const, opp = you === "w" ? g.blackId : g.whiteId;
            return { id: g.id, status: g.status, you, opponent: opp ? st.names[opp] ?? "Spiller" : null, timeControl: g.timeControl, inviteCode: g.status === "open" ? g.inviteCode ?? null : null };
          });
      },
    },
    moves: {
      async add(m) {
        if (st.moves.some((x) => x.gameId === m.gameId && x.ply === m.ply)) throw new Error("duplicate move");
        st.moves.push({ ...m });
      },
      async list(id) { return st.moves.filter((m) => m.gameId === id).sort((a, b) => a.ply - b.ply); },
    },
    account: {
      async exportAll(u) {
        return {
          ratings: st.ratings.filter((r) => r.userId === u), puzzleAttempts: st.attempts.filter((a) => a.userId === u),
          games: st.games.filter((g) => g.whiteId === u || g.blackId === u),
        };
      },
    },
  });
  return {
    get state() { return s.state; },
    async tx(fn) {
      const copy: State = structuredClone(s.state);
      const out = await fn(repos(copy));
      s.state = copy;
      return out;
    },
  };
}
