---
name: approve-cca
description: "Bulk approve PRs created by the Copilot Coding Agent. Use when: approve CCA PRs, bulk approve, merge agent PRs, review copilot PRs, approve copilot-swe-agent PRs, bulk merge."
argument-hint: "Optionally specify repos, e.g. 'microsoft/vscode-docker microsoft/vscode-containers'"
---

# Bulk Approve Copilot Coding Agent PRs

Reviews and approves pull requests created by the Copilot Coding Agent (`app/copilot-swe-agent`) across multiple repositories. PRs with no changed files are automatically closed. PRs with changes require explicit user approval before being approved, marked ready, and queued for merge.

## When to Use

- You dispatched tasks via `/dispatch-cca` and want to review and approve the resulting PRs
- You want to bulk-approve Copilot Coding Agent PRs assigned to you

## Procedure

### 1. Gather Target Repositories

Present the default repo checklist using the ask-questions tool with `multiSelect: true`. The user can select one or more repos, and also type a custom `owner/repo` if needed.

If the user already provided repositories in their message, skip this step.

#### Default Repositories

See [repos.md](../repos.md) for the default list of target repositories. When presenting options:
- Use the group heading (e.g., "Package", "Extension", "Extension pack", "Other") as the `description` for each option
- Sort options by group order (packages first, then extensions, then extension packs, then other), and alphabetically within each group

### 2. List Copilot Coding Agent PRs

For each selected repository, list open PRs authored by `app/copilot-swe-agent` and assigned to the current user:

```
gh pr list -R OWNER/REPO --app "copilot-swe-agent" --assignee "@me" --json number,title,url,changedFiles,headRefOid
```

Collect all results across repos. If no PRs are found, inform the user and stop.

### 3. Triage Each PR

For each PR found, check the `changedFiles` count:

#### If `changedFiles` is 0 — Auto-close

Close the PR without asking, since it has no changes:

```
gh pr close PR_NUMBER -R OWNER/REPO -c "Closing: no files were changed." -d
```

Report to the user that the PR was closed.

#### If `changedFiles` > 0 — Ask for Approval

First, print a summary of all PRs with clickable review links in a markdown message **before** asking the question. Format:

```
**PRs with changes to review:**
- **#PR_NUMBER** TITLE (OWNER/REPO) — N changed files — [Review changes](https://github.com/OWNER/REPO/pull/PR_NUMBER/files)
```

Then use the ask-questions tool to ask for explicit approval. The question options should list each PR by number and title (without the URL, since it was already printed above). Include a "Skip all" option.

### 4. Approve and Merge (for explicitly approved PRs only)

For each PR the user approved, run the following commands in sequence:

#### 4a. Approve the PR

```
gh pr review PR_NUMBER -R OWNER/REPO --approve
```

#### 4b. Mark as Ready

```
gh pr ready PR_NUMBER -R OWNER/REPO
```

#### 4c. Approve Pending Workflow Runs

Use the PR's `headRefOid` (head commit SHA, obtained in step 2) to find only the workflow runs that correspond to the latest commit on the approved PR:

```
gh run list -R OWNER/REPO --commit HEAD_REF_OID --status action_required --json databaseId,conclusion
```

This ensures we only target runs for the exact commit on the PR, not older runs on the same branch.

For each run where `conclusion` is `action_required`, re-run it to approve:

```
gh run rerun RUN_ID -R OWNER/REPO
```

If the re-run fails, ignore the error and continue.

#### 4d. Enable Auto-merge with Squash

```
gh pr merge PR_NUMBER -R OWNER/REPO --auto --squash
```

If auto-merge is not enabled on the repository, this will error — ignore the error and continue.

### 5. Report Results

Provide a summary table of all PRs processed:

| Repo | PR | Action | Result |
|------|----|--------|--------|
| `owner/repo` | #123 Title | Approved + auto-merge | Success |
| `owner/repo` | #456 Title | Closed (no changes) | Success |
| `owner/repo` | #789 Title | Skipped by user | — |

## Error Handling

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `gh: command not found` | GitHub CLI not installed | Install via `winget install GitHub.cli` or `brew install gh` |
| `not logged in` | Not authenticated | Run `gh auth login` |
| `Could not resolve to a PullRequest` | PR already merged or closed | Skip it |
| `auto-merge is not allowed` | Repo doesn't have auto-merge enabled | Ignore; the PR will need manual merge |
| `pull request is not mergeable` | Required checks haven't passed yet | Auto-merge will handle it once checks pass |
