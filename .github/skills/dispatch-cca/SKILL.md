---
name: dispatch-cca
description: "Dispatch tasks to the GitHub Copilot Coding Agent via gh agent-task to create pull requests. Use when: create PR, copilot agent task, agent-task, run coding agent, dependency update PR, code migration PR, refactor PR, dispatch CCA, bulk CCA."
argument-hint: "Describe the task you want the coding agent to perform, e.g. 'update all npm dependencies in microsoft/my-repo'"
---

# Copilot Coding Agent — PR Task Dispatcher

Dispatches tasks to the GitHub Copilot Coding Agent (`gh agent-task create`) on a target repository. The agent works autonomously in a cloud environment to create a pull request that fulfills the task.

## When to Use

- You want to create a PR in a GitHub repository using the Copilot Coding Agent
- Tasks include: custom code changes, dependency updates, code migrations/refactors
- You want to hand off work to the agent and receive a PR link

## Prerequisites

- The `gh` CLI must be installed and authenticated (`gh auth status`)
- The target repository must have GitHub Copilot Coding Agent enabled
- The user must have write access to the target repository

## Procedure

### 1. Determine the Target Repositories

Present the default repo checklist using the ask-questions tool with `multiSelect: true`. The user can select one or more repos, and also type a custom `owner/repo` if needed.

If the user already provided repositories in their message, skip this step.

#### Default Repositories

See [repos.md](../repos.md) for the default list of target repositories. When presenting options:
- Use the group heading (e.g., "Package", "Extension", "Extension pack", "Other") as the `description` for each option
- Sort options by group order (packages first, then extensions, then extension packs, then other), and alphabetically within each group

### 2. Determine the Task Type

If the user hasn't specified the task, ask them to choose or describe one:

| Task Type | Description |
|-----------|-------------|
| **Custom prompt** | User provides a free-form description of what the PR should do |
| **Dependency updates** | Update dependencies (npm, pip, NuGet, etc.) to latest compatible versions |
| **Code migration / refactor** | Migrate APIs, refactor patterns, update frameworks |

### 3. Build the Prompt

Construct a clear, actionable prompt for the coding agent. The prompt should be specific and include:

- What files or areas of the codebase to modify
- The desired outcome
- Any constraints (e.g., don't break existing tests, maintain backward compatibility)

#### Prompt Templates

**Dependency updates:**
```
Update all [package-manager] dependencies in this repository to their latest compatible versions. Run the existing test suite to verify nothing is broken. Summarize the changes in the PR description.
```

**Code migration / refactor:**
```
[Describe the migration/refactor]. Ensure all existing tests pass after the changes. Add or update tests if needed. Summarize the migration steps in the PR description.
```

**Custom:**
Use the user's description directly, enriched with any context gathered about the repo.

### 4. Execute the Agent Task

Run the following command **for each selected repository** in the terminal:

```
gh agent-task create "PROMPT" -R OWNER/REPO
```

Where:
- `OWNER/REPO` is the target repository (e.g., `microsoft/azcode-internal`)
- `PROMPT` is the task prompt constructed in step 3

**Important:** The prompt must be quoted. If it contains special characters, use single quotes or escape them.

#### Optional Flags

| Flag | Description |
|------|-------------|
| `-b, --base BRANCH` | Base branch for the PR (defaults to repo default branch) |
| `-a, --custom-agent NAME` | Use a custom agent defined in `.github/agents/NAME.md` |
| `-F, --from-file FILE` | Read the task description from a file (use `-` for stdin) |

### 5. Report the Result

After executing:
- Share the output from the `gh` command with the user
- If a PR was created, provide the PR URL
- If the command failed, diagnose the error and suggest fixes (e.g., auth issues, repo access, agent not enabled)

## Error Handling

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `gh: command not found` | GitHub CLI not installed | Install via `winget install GitHub.cli` or `brew install gh` |
| `not logged in` | Not authenticated | Run `gh auth login` |
| `repository not found` | Wrong repo name or no access | Verify `owner/repo` format and permissions |
| `agent not available` | Copilot Coding Agent not enabled | Enable in repo settings under Copilot |

## Examples

**Custom task:**
```
gh agent-task create "Add input validation to all Azure Functions endpoints. Ensure that required parameters are checked and descriptive error messages are returned for invalid inputs." -R microsoft/azcode-internal
```

**Dependency update:**
```
gh agent-task create "Update all npm dependencies to their latest compatible versions. Run tests to verify nothing breaks." -R microsoft/azcode-internal
```

**Code migration:**
```
gh agent-task create "Migrate all Azure Functions from v3 to v4 programming model. Update imports, function registration, and configuration accordingly." -R microsoft/azcode-internal
```
