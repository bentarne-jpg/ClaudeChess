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
