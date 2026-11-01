# Working in this repository

**Read `ARCHITECTURE.md` before every change, and verify the change against it before you write
code.** It is the binding architecture manifest for this project.

- Follow the change protocol in `ARCHITECTURE.md` §9: classify, locate, check the rules, plan the
  tests, then make the change.
- If a request would break a MUST rule, stop and explain the conflict to the owner instead of
  working around it. The manifest only changes through an approved amendment (§11).
- Work on a branch and open a pull request; never push directly to `main` (E1).
- Every pull request description includes the completed "Manifest check" section (§9).
- The app's interface is Norwegian (bokmål); code, comments and commit messages are English.
- Before a change, check what is live in each channel (`versions.json` on the site, or the `site`
  branch): production, staging (`/next/`), dev channels and every kept release (E10).
- Never release to production or roll back unless the owner asks. Releases and rollbacks are run with
  the Deploy workflow (`docs/RELEASING.md`); every release is kept (E7, E8).
- New work the owner wants to try first goes on a `dev/<name>` branch, published at `/dev/<name>/`.
