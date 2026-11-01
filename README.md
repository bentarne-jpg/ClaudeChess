# Sjakkverkstedet

A chess app that runs entirely in the browser, with no server of its own. It opens on a home page
with one card per module:

- **Analyse** – paste a PGN or pick a game from *Mine partier*. Stockfish rates every move
  (Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Blunder), with an
  evaluation bar, an evaluation graph and the engine's best move. The opening is named from a
  database of 3,864 openings.
- **Sjakknøtter** – 24,595 rated puzzles (400–3166). Your puzzle rating adapts as you solve
  them: you gain about twice as much for a solve as you lose for a miss.
- **Spill mot bot** – play Stockfish at roughly 600–2800, with or without a clock. Pick a
  time control such as 1+1 or 5+10 (minutes + seconds added per move), or enter and save your
  own. Finished games are saved to *Mine partier* and can be analysed.

The interface is in Norwegian.

All changes follow the architecture manifest in [`ARCHITECTURE.md`](ARCHITECTURE.md); decisions are
recorded in [`docs/adr/`](docs/adr/).

## Running it

The repository is an npm workspace (Node 22):

```sh
npm ci
npm run dev          # the app at http://localhost:5173
npm run check        # typecheck, lint and layer rules, unit tests, build
npx playwright test  # end-to-end tests (desktop and phone sizes)
npm run build:offline  # dist/Sjakkverkstedet-offline.html, one file that runs from disk
```

Open the app with `?engine=fake` to use a fast, deterministic stand-in for Stockfish.

## Versions and releases

Production, staging (`/next/`), development previews (`/dev/<name>/`) and every released version
(`/releases/<version>/`) are all on the GitHub Pages site. How to test, release and roll back is in
[`docs/RELEASING.md`](docs/RELEASING.md).

## Where data is kept

Signed in (Google, Facebook or Vipps), ratings, puzzle history and games are stored in Supabase;
ratings are computed only on the server. Signed out, everything stays in the browser
(`localStorage`) as before, and is imported once on the first sign-in. When the page runs as a Claude artifact on claude.ai, it also stores them on
your Claude account, so they follow you between devices. That account storage is only
available inside claude.ai.

## Layout

| Path | What it is |
|---|---|
| `packages/domain/` | Rules and maths shared by the app and (later) the server: move classification, accuracy, puzzle rating, clock, time controls, PGN, openings. Pure TypeScript with unit tests |
| `packages/contracts/` | Every message between app and server, as zod schemas |
| `packages/server/` | Server use cases (puzzles, bot games, account) with ports, an in-memory adapter for tests and a Postgres adapter |
| `supabase/` | Database migrations with row-level security, the `api` Edge Function, database tests. Setup: [`docs/SETUP-SUPABASE.md`](docs/SETUP-SUPABASE.md) |
| `apps/web/` | The web app (Vite). `src/core/` display text, `src/adapters/` engine and storage adapters, `src/legacy/` the feature code still being migrated |
| `apps/web/public/` | Stockfish 10 (stockfish.js 10.0.2), the opening table and the puzzles |
| `tests/e2e/` | Playwright tests |
| `tools/` | Offline build and the Pages site assembler |
| `ARCHITECTURE.md` | The architecture manifest every change is checked against |
| `docs/adr/` | Architecture decision records |

## Credits and licences

- **Stockfish** – GPL-3.0, by the Stockfish developers; browser build by Nathan Rugg
  ([nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js)). Licence text in
  `apps/web/public/STOCKFISH-COPYING.txt`. Because the app ships Stockfish, distributing it falls under the
  GPL: keep this notice and make the source available.
- **chess.js** – BSD-2-Clause, by Jeff Hlywa ([jhlywa/chess.js](https://github.com/jhlywa/chess.js)).
  Licence text in `apps/web/public/CHESSJS-LICENSE.txt`.
- **Openings** – [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0).
- **Puzzles** – a subset of the [Lichess puzzle database](https://database.lichess.org/#puzzles)
  (CC0), as collected in [FeXd/puzzle-chess](https://github.com/FeXd/puzzle-chess).
- **Pieces** – the cburnett set by Colin M.L. Burnett, CC BY-SA 3.0.
