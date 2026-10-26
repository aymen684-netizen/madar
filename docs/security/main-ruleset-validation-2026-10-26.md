# Main branch protection validation — 2026-10-26

This temporary document is used only to validate the GitHub ruleset `madar-main-reviewed-release` (ID `25900441`).

- Target: `main`
- Scope: documentation-only, isolated test branch
- Expected PR checks: checks, startup, browser (observing), browser (interface), browser (reports), browser (extras), performance, asset-update, release-http, release-ready
- Expected GitHub Actions source: app ID 15368
- Production assets, Worker, secrets, and deployment settings: unchanged

**Do not merge this validation PR.** It exists to verify that the protection rule blocks merging until the required checks have succeeded. Close it after validation.

Reference: `c98879d997e88d802895b1789ae5dafad18d39c2`.
