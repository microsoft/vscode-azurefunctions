# Branch Setup

## Step 1: Verify Repository and Detect Identity

Confirm we are in an `ms-azuretools` extension repository and capture variables used by later phases:

```bash
# Verify publisher
cat package.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('publisher',''), d.get('name',''))"

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
git checkout -b copilot-rel-prep/$(date +%Y-%m-%d)
```

Confirm the branch was created and show the current HEAD commit SHA.
