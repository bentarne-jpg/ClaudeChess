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

## Running it

The app is static files. Serve the `app/` folder with any web server, for example:

```sh
cd app
python3 -m http.server 8000
```

Then open <http://localhost:8000>. In a Codespace, open the forwarded port 8000.

Opening `app/index.html` directly from disk does not work, because browsers block loading the
engine and data files from `file://`. Use the offline file for that.

### Offline version

`dist/Sjakkverkstedet-offline.html` is one file (about 4.5 MB) with everything inlined. Open it
straight from disk, without a network connection. Rebuild it after changing the app:

```sh
python3 tools/build_offline.py
```

### Publishing with GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes `app/` on every push to `main`. Turn it
on once under Settings → Pages → Build and deployment → Source: **GitHub Actions**. The app is
then at `https://<your-username>.github.io/ClaudeChess/`.

## Where data is kept

Ratings, the game in progress and your list of games are stored in the browser
(`localStorage`). When the page runs as a Claude artifact on claude.ai, it also stores them on
your Claude account, so they follow you between devices. That account storage is only
available inside claude.ai.

## Files

| Path | What it is |
| --- | --- |
| `app/index.html` | The whole app: markup, styles and script |
| `app/chess.js` | chess.js 0.10.3, move generation and PGN handling |
| `app/stockfish.js`, `app/stockfish.wasm`, `app/stockfish.asm.js` | Stockfish 10 compiled for the browser (stockfish.js 10.0.2) |
| `app/openings.json` | Position → ECO code and opening name |
| `app/puzzles.json` | `[id, FEN, solution moves, rating]` for each puzzle |
| `dist/Sjakkverkstedet-offline.html` | Single-file offline build |
| `tools/build_offline.py` | Builds the offline file from `app/` |

## Credits and licences

- **Stockfish** – GPL-3.0, by the Stockfish developers; browser build by Nathan Rugg
  ([nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js)). Licence text in
  `app/STOCKFISH-COPYING.txt`. Because the app ships Stockfish, distributing it falls under the
  GPL: keep this notice and make the source available.
- **chess.js** – BSD-2-Clause, by Jeff Hlywa ([jhlywa/chess.js](https://github.com/jhlywa/chess.js)).
  Licence text in `app/CHESSJS-LICENSE.txt`.
- **Openings** – [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0).
- **Puzzles** – a subset of the [Lichess puzzle database](https://database.lichess.org/#puzzles)
  (CC0), as collected in [FeXd/puzzle-chess](https://github.com/FeXd/puzzle-chess).
- **Pieces** – the cburnett set by Colin M.L. Burnett, CC BY-SA 3.0.
