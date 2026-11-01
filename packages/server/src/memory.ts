/* In-memory adapter for tests (manifest T2/T3). Transactions copy state and commit on success. */
import type { GamePlayer, GameRow, PuzzleAttempt, RatingRow, Repos, Store } from "./ports.ts";

export interface State { ratings: RatingRow[]; attempts: PuzzleAttempt[]; games: (GameRow & { id: string })[]; players: GamePlayer[] }

export function memoryStore(): Store & { state: State } {
  const s: { state: State } = { state: { ratings: [], attempts: [], games: [], players: [] } };
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
      async insert(g) { const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`; st.games.push({ ...g, id }); return id; },
      async byClientId(u, c) { return st.games.find((g) => g.createdBy === u && g.clientId === c) ?? null; },
      async addPlayer(p) { st.players.push({ ...p }); },
      async players(id) { return st.players.filter((p) => p.gameId === id); },
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
