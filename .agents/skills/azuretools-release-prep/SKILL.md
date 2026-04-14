---
name: azuretools-release-prep
description: "Automates release preparation for 'ms-azuretools' VS Code extensions (e.g. vscode-azurefunctions, vscode-azurecontainerapps, vscode-azureresourcegroups, vscode-azureappservice, vscode-azurestorage, etc.). Handles branch setup from latest main, intelligent version bump recommendation based on git history analysis, constructed CHANGELOG.md entry with curated commit inclusion/exclusion, and surfaces NOTICE.html and telemetry TODOs. WHEN: release prep, prepare release, bump version, update changelog, prep for release, release branch, version bump."
license: MIT
metadata:
  author: Microsoft
  version: "1.0.0"
---

# Azure Tools for VS Code - Release Prep

> **AUTHORITATIVE GUIDANCE — MANDATORY COMPLIANCE**
>
> This skill drives the full release preparation workflow for any VS Code extension published by **ms-azuretools**. Execute phases in order. **Never apply changes without user confirmation.**

---

## Triggers

Activate this skill when the user wants to:
- Prepare a release for any `ms-azuretools` VS Code extension
- Bump the package version for a release
- Build or update the CHANGELOG for a new release
- Create a release prep branch

---

## Rules

1. Always pull the latest `main` and branch from it — never from a stale or feature branch unless told otherwise
2. Always identify the last **stable** release tag before analyzing commits (skip `-alpha`, `-beta`, `-rc`)
3. Always present a recommendation with reasoning **before** asking the user to choose a version
4. Always show the full changelog draft with omission reasoning **before** writing any files
5. Never commit directly to `main`
6. Never apply file changes without user confirmation

---

## ⚠️ CONFIRM-BEFORE-APPLY — MANDATORY

> 1. **SETUP** — Pull latest main, create release branch
> 2. **ANALYZE** — Classify commits, recommend version bump, get user approval
> 3. **SELECT** — Interactive commit selection list → generate changelog → get user approval
> 4. **APPLY** — Write `package.json` and `CHANGELOG.md`
> 5. **PUBLISH** — Review generated assets, commit, push, create draft PR, create draft release notes
> 6. **NEXT STEPS** — Show remaining Next Steps as a markdown checklist

---

## Phase 1: Branch Setup

| # | Action | Reference |
|---|--------|-----------|
| 1 | Verify we are in the correct repository | [branch-setup.md](references/branch-setup.md) |
| 2 | Fetch origin, checkout `main`, pull latest | [branch-setup.md](references/branch-setup.md) |
| 3 | Create a timestamped release branch | [branch-setup.md](references/branch-setup.md) |

---

## Phase 2: Version Analysis

| # | Action | Reference |
|---|--------|-----------|
| 1 | Find last stable release tag; get current version from `package.json` | [version-analysis.md](references/version-analysis.md) |
| 2 | Collect all commits since last tag | [version-analysis.md](references/version-analysis.md) |
| 3 | Classify each commit and flag suggested skips | [commit-classification.md](references/commit-classification.md) |
| 4 | Determine recommended version bump | [version-analysis.md](references/version-analysis.md) |
| 5 | Present reasoning summary and ask user to choose version | [version-analysis.md](references/version-analysis.md) |

> ❌ **Do not proceed to Phase 3 until the user confirms the target version.**

---

## Phase 3: Changelog Construction

| # | Action | Reference |
|---|--------|-----------|
| 1 | Present interactive numbered list using classifications from Phase 2 — all pre-selected, ⚠️ on suggested skips | [changelog-construction.md](references/changelog-construction.md) |
| 2 | Accept deselections from user; re-render until confirmed | [changelog-construction.md](references/changelog-construction.md) |
| 3 | Generate and display changelog entry in chat for review | [changelog-construction.md](references/changelog-construction.md), [changelog-template.md](references/changelog-template.md) |

> ❌ **Do not proceed to Phase 4 until the user approves the generated entry.**

---

## Phase 4: Apply Changes

| # | Action | Reference |
|---|--------|-----------|
| 1 | Update `"version"` in `package.json` | [version-analysis.md](references/version-analysis.md) |
| 2 | Prepend approved entry to `CHANGELOG.md` | [changelog-construction.md](references/changelog-construction.md) |

---

## Phase 5: Review and Publish

| # | Action | Reference |
|---|--------|-----------|
| 1 | Show `git diff` of `package.json` and `CHANGELOG.md` | — |
| 2 | Ask user if they want to commit, push, and open a draft PR + release | [pr-creation.md](references/pr-creation.md) |
| 3 | Stage, commit, and push the release branch | [pr-creation.md](references/pr-creation.md) |
| 4 | Create draft PR and print the URL | [pr-creation.md](references/pr-creation.md) |
| 5 | Create draft GitHub Release (body = changelog entry) and print the URL | [pr-creation.md](references/pr-creation.md) |

---

## Phase 6: Surface Next Steps

| # | Action | Reference |
|---|--------|-----------|
| 1 | Create release checklist issue in `microsoft/azcode-internal` and capture URL | [release-checklist-issue.md](references/release-checklist-issue.md) |
| 2 | Generate session summary file with what was done and next steps | [next-steps-summary.md](references/next-steps-summary.md) |
| 3 | Print the file path to the chat | [next-steps-summary.md](references/next-steps-summary.md) |

---

## Outputs

| Artifact | Change |
|----------|--------|
| `package.json` | `version` field bumped to `NEW_VERSION` |
| `CHANGELOG.md` | New entry prepended at top |
| Git branch | Pushed to origin |
| Draft PR | Opened on GitHub |
| Draft Release | Created on GitHub (`v<NEW_VERSION>`), body matches changelog entry |
| Session summary | Written to `~/.copilot/session-state/<session-id>/release-prep-<REPO_NAME>-<NEW_VERSION>.md` |
| Release checklist issue | Created in `microsoft/azcode-internal` |

---

## References

- [Branch Setup](references/branch-setup.md)
- [Version Analysis](references/version-analysis.md)
- [Commit Classification](references/commit-classification.md)
- [Changelog Template](references/changelog-template.md)
- [Changelog Construction](references/changelog-construction.md)
- [PR Creation](references/pr-creation.md)
- [Release Checklist Issue](references/release-checklist-issue.md)
- [Next Steps Summary](references/next-steps-summary.md)
