---
name: setup-gh
description: "Install and authenticate the GitHub CLI (gh). Use when: install gh, setup gh, authenticate gh, gh auth login, gh not found, gh setup, github cli install."
---

# GitHub CLI Setup

Install the GitHub CLI (`gh`) and authenticate for use with other skills like `/dispatch-cca` and `/approve-cca`.

## When to Use

- `gh` is not installed or not found
- The user needs to authenticate with GitHub
- First-time setup before using CCA skills

## Procedure

### 1. Check if gh is installed

```
gh --version
```

If this succeeds, skip to step 3.

### 2. Install gh

Detect the user's OS and install accordingly:

| OS | Command |
|----|---------|
| Windows | `winget install GitHub.cli` |
| macOS | `brew install gh` |
| Linux (Debian/Ubuntu) | See [GitHub CLI install docs](https://github.com/cli/cli/blob/trunk/docs/install_linux.md) |

After install, verify with `gh --version`.

### 3. Check authentication

```
gh auth status
```

If already authenticated, inform the user and stop.

### 4. Authenticate

Run the interactive login:

```
gh auth login
```

Guide the user through the prompts:
- **Where do you use GitHub?** → GitHub.com
- **Preferred protocol?** → HTTPS
- **Authenticate with?** → Browser (recommended)

### 5. Verify

After login, confirm authentication:

```
gh auth status
```

Report the authenticated user and scopes.
