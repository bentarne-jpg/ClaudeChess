# ADR-0001: Adopt an architecture manifest and a layered TypeScript monorepo

- Status: accepted
- Date: 2026-11-01

## Context

The app is a single HTML file with all logic, rendering and storage mixed together, and it stores
data only in the browser. The owner plans user logins, server-side ratings and history, and
person-vs-person play, and wants to direct feature changes without eroding the structure.

## Decision

- Adopt `ARCHITECTURE.md` as the binding manifest. Every change is checked against it and the
  check is recorded in the pull request.
- Move to a TypeScript monorepo with a shared, pure domain package, a client and a server, using
  ports and adapters (hexagonal architecture), with boundaries enforced in CI.
- Make the server authoritative for results, clocks and ratings.
- Test every layer: domain, application, adapter contracts, API/realtime, end-to-end.

## Alternatives considered

- **Keep the single file and add a backend beside it.** Fastest, but rules would be duplicated
  between client and server, and nothing could be tested in isolation.
- **Backend-as-a-service only, with logic in the client.** Simple, but cannot be trusted for
  person-vs-person clocks, results or ratings.

## Consequences

- A one-time migration (phase 1) with no visible change for users.
- More files and tooling, in return for isolated features, fast tests and safe changes.
- Hosting and login provider are decided separately (ADR-0002, ADR-0003).
