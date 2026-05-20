# Branch Setup

## Preflight Checks

Before touching any files, verify the environment is ready:

```bash
# 1. Verify gh CLI is authenticated
gh auth status

# 2. Ensure the working tree is clean (no uncommitted changes)
git status --porcelain
```

If `gh auth status` shows an error, ask the user to run `gh auth login` before continuing.

If `git status --porcelain` produces any output, warn the user that uncommitted changes are present. Ask them to stash or commit first. **Do not proceed until the working tree is clean.**

---

## Step 1: Detect Repository

Confirm we are in an `ms-azuretools` extension repository and capture variables used by later phases:

```bash
# Verify publisher
python3 -c "import json; d=json.load(open('package.json')); print(d.get('publisher',''), d.get('name',''))"

# Capture remote URL (strip .git suffix)
git remote get-url origin
```

Expected: `publisher` = `ms-azuretools`. Known extensions include:
`vscode-azurefunctions`, `vscode-azurecontainerapps`, `vscode-azureresourcegroups`,
`vscode-azureappservice`, `vscode-azurestorage`, `vscode-cosmosdb`, `vscode-azurestaticwebapps`, `vscode-azurevirtualmachines`

If `publisher` is not `ms-azuretools`, warn the user and ask for confirmation before continuing.

Store for use in later phases:
- `REPO_NAME` — the `name` field from `package.json`
- `REPO_REMOTE_URL` — remote origin URL with `.git` stripped (e.g. `https://github.com/microsoft/vscode-azurecontainerapps`)

---

## Step 2: Pull Latest Main

```bash
git fetch origin
git checkout main
git pull origin main --ff-only
```

---

## Step 3: Create Release Branch

Branch name does not matter — use a timestamped name:

```bash
git checkout -b copilot-rel-prep/$(date +%Y-%m-%d-%H%M)
```

Confirm the branch was created and show the current HEAD commit SHA.
