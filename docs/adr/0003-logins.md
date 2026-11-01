# ADR-0003: Login with Google, Facebook and Vipps

- Status: accepted
- Date: 2026-11-01

## Decision

Users sign in through Supabase Auth with hosted providers only:

- **Google** – built-in Supabase provider.
- **Facebook** – built-in Supabase provider (scopes `public_profile`, `email`).
- **Vipps** – Vipps MobilePay Login, connected as a Supabase custom OIDC provider with identifier
  `custom:vipps` (scopes `openid name email`). Supabase supports custom OIDC providers since
  April 2026.

The app stores no passwords. Each provider is shown only when it is switched on in configuration,
so a provider can be added or removed without code changes.

## Consequences

- Vipps Login has to be ordered from Vipps MobilePay, which runs compliance checks before issuing
  production keys; this normally needs a business agreement. Until then the Vipps button stays
  hidden.
- Facebook needs a Meta developer app; Google needs an OAuth client in Google Cloud.
- A person who signs in with two providers gets two accounts unless they share a verified email;
  Supabase links identities with the same verified email automatically.
