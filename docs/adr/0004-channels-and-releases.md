# ADR-0004: Release channels, kept versions and rollback

- Status: accepted
- Date: 2026-11-01

## Context

The owner wants to roll back to the last known good version if anything breaks, to keep every
released version, and to build and test development versions before they reach production.

## Decision

- The GitHub Pages site holds three channels: production at the root, staging at `/next/` (from
  `main`), and one preview per `dev/<name>` branch at `/dev/<name>/`.
- The assembled site lives on a `site` branch. Each release is copied to `/releases/<version>/` and
  never removed, so rolling back is a copy of an existing folder, with no rebuild.
- Releases are semantic versions, made with the Deploy workflow from a commit that passed CI. The
  workflow tags the commit and creates a GitHub Release with the offline file.
- `v1.0.0` is the single-file app that was live before the migration. It is kept on the branch
  `release/v1.0.0` and seeds the site on the first deploy.

## Alternatives considered

- **Netlify/Vercel/Cloudflare Pages previews.** Built-in previews and instant rollback, but another
  service and account; GitHub Pages already hosts the app.
- **Rebuilding old tags on rollback.** Slower and can fail if dependencies have moved.

## Consequences

- The `site` branch grows with every release (a few MB each). That is fine for years of releases.
- Production only changes when the owner runs a release or rollback.
- Database migrations must stay compatible with the previous release (manifest E9).
