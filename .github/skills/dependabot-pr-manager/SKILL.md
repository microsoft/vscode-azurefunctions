---
name: dependabot-pr-manager
description: 'Find, approve, and merge Dependabot PRs across all repos. Use when: reviewing Dependabot PRs, merging dependency updates, handling Dependabot, bulk-approving PRs, managing dependency bumps.'
argument-hint: 'Optional: team slugs to search (e.g. microsoft/MyTeam). Defaults to review-requested:@me.'
---

# Dependabot PR Manager

Finds all open Dependabot PRs where the user's review is requested (including via team membership), approves them, and enables squash auto-merge. PRs in archived repos are excluded. PRs where auto-merge fails are reported with clickable hyperlinks for manual merging.

## When to Use

- Bulk-approve and merge Dependabot PRs
- Review pending Dependabot dependency updates across all repos
- Clean up Dependabot PR backlog

## Procedure

### Step 1 — Discover PRs

Search for open Dependabot PRs requesting the user's review. Exclude archived repos.

```shell
# Fetch all open PRs where review is requested from @me, authored by Dependabot
gh api "search/issues?q=is:pr+is:open+review-requested:@me+author:app/dependabot&per_page=100" \
  --jq '[.items[] | {repo: (.repository_url | split("/")[-2:] | join("/")), number, title, updated: .updated_at}]'
```

For each result, check if the repo is archived and exclude it:

```shell
gh api "repos/{owner}/{repo}" --jq '.archived'
```

### Step 2 — Present the list and confirm

Display the filtered PR list to the user as a markdown table with hyperlinks in this format:

```
| Repo | PR | Title | Updated |
|------|----|-------|---------|
| owner/repo | [#123](https://github.com/owner/repo/pull/123) | Bump foo from 1.0 to 2.0 | Mar 2026 |
```

Ask the user to confirm before proceeding. **Do not approve or merge without explicit user confirmation.**

### Step 3 — Approve all PRs

For each confirmed PR, approve it:

```shell
gh pr review {number} --repo {owner/repo} --approve --body "Approving Dependabot dependency update."
```

### Step 4 — Enable auto-merge (squash)

For each approved PR, enable squash auto-merge:

```shell
gh pr merge {number} --repo {owner/repo} --auto --squash
```

Track failures. A PR may fail auto-merge if:
- The repo does not have auto-merge enabled in its settings
- Branch protection rules prevent it
- Required status checks are not configured

### Step 5 — Report results

Report the outcome to the user:

1. **Successful**: List PRs that were approved and have auto-merge enabled.
2. **Failed auto-merge**: List PRs where approval succeeded but auto-merge failed, with clickable hyperlinks so the user can manually merge them:

```
The following PRs could not have auto-merge enabled. Please merge manually:
- [owner/repo#123](https://github.com/owner/repo/pull/123) — Bump foo from 1.0 to 2.0
```

## Important Notes

- Always use **squash** merge strategy.
- Always **exclude archived repos** from the results.
- Always **confirm with the user** before approving/merging.
- Run approve and auto-merge commands **sequentially** (not in parallel) to avoid rate limiting.
- If the `gh` CLI is not authenticated, instruct the user to run `gh auth login` first.
