# Versions, testing and releases

The app is published on GitHub Pages in three channels. Each one is a full copy of the app.

| Channel | Address | Updated when |
|---|---|---|
| Production | <https://bentarne-jpg.github.io/ClaudeChess/> | a release or a rollback is run |
| Staging | <https://bentarne-jpg.github.io/ClaudeChess/next/> | something is merged to `main` |
| Development | `https://bentarne-jpg.github.io/ClaudeChess/dev/<name>/` | a `dev/<name>` branch is pushed |
| Any release | `https://bentarne-jpg.github.io/ClaudeChess/releases/<version>/` | kept forever |

[`versions.json`](https://bentarne-jpg.github.io/ClaudeChess/versions.json) lists what is in
production, every release, every dev channel, and the history of releases and rollbacks.

## Building a new development version

1. Ask Claude for a dev version, for example "make a dev version for the new board theme". Claude
   creates the branch `dev/board-theme`, and every push to it is published at `/dev/board-theme/`.
2. Test it there. Each push updates the preview within a few minutes.
3. When it is good, Claude opens a pull request into `main`. CI must be green to merge.
4. After the merge it appears on staging at `/next/`. Deleting the dev branch removes its preview.

## Releasing to production

Only the owner decides when something goes to production.

1. Check the version on staging (`/next/`).
2. On GitHub: **Actions → Deploy → Run workflow**, choose `release`, enter the next version (for
   example `v1.1.0`) and the ref (`main`, or a specific commit).
3. The workflow refuses to release a commit that has not passed CI. It builds the app, keeps it at
   `/releases/v1.1.0/`, makes it production, tags it and creates a GitHub Release with the offline
   file attached.

Version numbers: `MAJOR` for changes that break saved data or need a new database, `MINOR` for
new features, `PATCH` for fixes.

## Rolling back

If production breaks: **Actions → Deploy → Run workflow**, choose `rollback` and enter the version to
go back to (for example `v1.0.0`). The kept copy of that release becomes production within a
minute or two, with no rebuild. The broken version stays under `/releases/` so it can be examined.

Database changes are made backward compatible with the previous release (manifest E9), so a web
rollback works against the current database.

## Versions so far

| Version | What it is |
|---|---|
| v1.0.0 | The single-file app as it ran before the move to a TypeScript monorepo. Kept on the branch `release/v1.0.0` and published at `/releases/v1.0.0/` on the first deploy. |
