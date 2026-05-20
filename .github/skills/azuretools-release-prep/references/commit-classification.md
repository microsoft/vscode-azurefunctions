# Commit Classification Guide

## Categories

| Category | Changelog Section | Version Signal |
|----------|------------------|----------------|
| `ADDED` | `### Added` | → minor or patch |
| `CHANGED` | `### Changed` | → minor or patch |
| `FIXED` | `### Fixed` | → patch |
| `SECURITY` | `### Security` | → patch |
| `ENGINEERING` | `### Engineering` | → patch |
| `SKIP` | Recommended to omit — user has final say | — |
| `BREAKING` | Note in `### Changed` or `### Added` | → **major** |

---

## SKIP — Recommended to omit

All `SKIP` items are flagged ⚠️ in the selection list. The user can include any of them.

Dep bump / upgrade patterns are pre-consolidated into a single entry — the user can keep or remove it.

- `Bump <pkg> from X to Y`
- `Bump <pkg>` (no version)
- `Upgrade <pkg> to X.Y.Z`
- `Release prep for X.Y.Z`
- `Bump version post release`
- CI / workflow-only changes
- `npm audit fix` rounds

**Exception:** a dep bump that fixes a user-visible CVE or addresses a security vulnerability → `SECURITY`.

---

## SECURITY — Security fixes and vulnerability patches

Includes: CVE fixes, dep bumps that address a known vulnerability, auth/permission hardening, removal of insecure patterns.

Signals: `CVE`, `vulnerability`, `security`, `audit`, `patch`, or any dep bump explicitly citing a CVE or advisory.

---

## ADDED — New user-facing functionality

Signals: `Add `, `Support `, `Enable `, `New `

Includes: new commands, templates, trigger types, settings, project types, feature flags removed (GA of preview feature).

---

## CHANGED — Modified existing behavior

Signals: `Update `, `Change `, `Replace `, `Improve `, `Group `, `Use `, `Auto-`, `Respect `, `Only `

Includes: UX reorganization, behavior adjustments, core dependency upgrades with user-visible impact, deprecations.

---

## FIXED — Bug fixes

Signals: `Fix `, `Resolve `, `Fallback `, `Don't `, `Prevent `

Includes: regressions, error handling improvements. Performance improvements that fix a regression → FIXED; general improvements → CHANGED.

---

## ENGINEERING — Internal work worth noting

Use sparingly. Signals: build system migrations, major refactors, significant test infrastructure changes.

Examples: `Esbuild migration`, `Replace JsonCli tool with direct nupkg parsing`.

---

## BREAKING — Breaking changes

Flag when a commit:
- Removes an existing command, setting, or feature
- Changes existing behavior incompatibly
- Requires users to update config or workspace files
- Drops support for a runtime or platform version

→ Triggers a **major** version bump recommendation.

---

## Decision Tree

```
Release prep / version bump?              → SKIP
CI / workflow-only / npm audit fix?       → SKIP
Dep bump / upgrade (no CVE)?              → SKIP (pre-consolidate into one summary line)
Dep bump / security fix with CVE?         → SECURITY
Security-related change (auth, vulns)?    → SECURITY
New feature, command, template, trigger?  → ADDED
Bug fix or regression?                    → FIXED
Existing behavior changed (non-breaking)? → CHANGED
Breaking change or removal?               → BREAKING
Significant internal refactor?            → ENGINEERING
Everything else                           → SKIP
```
