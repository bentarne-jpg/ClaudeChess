# ADR-0005: Nothing is saved without a login

- Status: accepted
- Date: 2026-11-02

## Context

Before accounts, the app kept ratings, games and the game in progress in the browser
(localStorage). After accounts arrived, the owner found his games visible in the analysis whether he
was logged in or not, and decided that history and ratings belong to the account only.

## Decision

- Signed out, every activity is standalone: ratings, games, puzzle history and a game in progress
  live in memory for the visit and are gone after a reload.
- Signed in, they live on the account (Supabase). The browser keeps only the login session.
- Harmless preferences (analysis depth) may stay in browser storage.
- Activity saved in the browser by earlier versions is imported once on the first login and then
  removed from the browser. Until then it is neither shown nor used.

## Consequences

- A signed-out bot game is lost on reload; the offline file saves nothing.
- Shared computers no longer show the previous person's games.
- Manifest D1 and D6 are amended accordingly.
