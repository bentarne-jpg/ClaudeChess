# ADR-0006: One Supabase project for every channel

- Status: accepted
- Date: 2026-11-05

## Context

Manifest E3 had dev previews and staging (`/next/`) use a `sjakkverkstedet-staging` Supabase project,
and production use `sjakkverkstedet-production`. The Supabase free tier allows two active projects
per account, and the owner needs a slot for another app. Sjakkverkstedet is a personal test project
with few users.

## Decision

- There is one Supabase project, `Sjakkverkstedet` (the former `sjakkverkstedet-production`). Every
  web channel – production, `/next/` and `/dev/<name>/` – builds against it.
- The Supabase workflow has no target choice; it always deploys to that project.
- Database changes are proven in CI against the local Supabase stack (E4) and stay backward
  compatible with the previous release (E9). They are deployed before the code that needs them is
  merged, so `/next/` and production both keep working.
- The `sjakkverkstedet-staging` project is paused, not deleted, so it can be restored.

## Alternatives considered

- **Keep two projects.** Leaves no free slot for another app.
- **Supabase Pro.** About 25 USD a month for a test project.
- **Accounts off on `/next/` and dev previews.** Safer data, but logins could not be tried before a
  release.

## Consequences

- Dev previews and `/next/` read and write real data. Untested code on a dev branch can change it,
  so dev branches SHOULD avoid destructive data changes.
- The repository variables `STAGING_*` and the `supabase-staging` environment are no longer used.
- E4 still asks for a separate staging project before person-vs-person play is opened to others.
