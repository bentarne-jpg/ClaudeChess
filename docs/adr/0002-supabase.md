# ADR-0002: Supabase as backend platform

- Status: accepted
- Date: 2026-11-01

## Context

Logins, server-side ratings and history, and person-vs-person play need a backend that can be
trusted. The owner chose Supabase.

## Decision

- **Postgres** is the source of truth. Every table has row-level security. Users can read their own
  rows (and games they play in); writes that affect fairness (moves, results, ratings) happen only
  in Edge Functions with the service role, or in `security definer` functions.
- **Auth** handles logins with hosted providers (ADR-0003). The web app holds only the anon key.
- **Edge Functions** (Deno, TypeScript) are the server-side use cases. They import the same
  `packages/domain` code as the web app, so rules never diverge.
- **Realtime** pushes game updates to both players.
- The web app stays a static site on GitHub Pages.

This replaces the earlier "Node.js + Fastify + WebSocket" server row in the manifest.

## Alternatives considered

- **Own Node server on Azure.** Full control, but more to operate (hosting, scaling, sockets, auth
  integration) for a hobby-sized app.
- **Firebase.** Similar convenience, but NoSQL fits ratings, history and reporting less well than
  Postgres.

## Consequences

- No server to run; costs start at Supabase's free tier.
- Server logic runs on Deno, so the domain package must stay free of Node-only APIs.
- Integration tests run against a local Supabase stack in CI (`supabase start`).
