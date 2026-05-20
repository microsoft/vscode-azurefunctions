# Release Checklist Issue

> **Note:** `microsoft/azcode-internal` is a private repo. The `gh` CLI must be authenticated with an account that has access. If any step returns a 404 or 403, prompt the user to verify with `gh auth status`.

## Step 1: Discover the Template

```bash
gh api repos/microsoft/azcode-internal/contents/.github/ISSUE_TEMPLATE
```

Find the entry whose name matches `extension-release-checklist` (exact filename may vary — pick the closest match).

---

## Step 2: Fetch Template Body

```bash
gh api repos/microsoft/azcode-internal/contents/.github/ISSUE_TEMPLATE/<template-filename> \
  --jq '.content' | base64 --decode
```

Strip any YAML frontmatter (the `---` block at the top) — use only the markdown body below it.

---

## Step 3: Create the Issue

```bash
gh api repos/microsoft/azcode-internal/issues \
  --method POST \
  --field title="<NEW_VERSION> <REPO_NAME> Release Checklist" \
  --field body="<TEMPLATE_BODY>"
```

Print the issue URL to the chat and store it as `CHECKLIST_ISSUE_URL`.

---

## Issue Title Format

```
<NEW_VERSION> <REPO_NAME> Release Checklist
```

Example: `1.22.0 vscode-azurefunctions Release Checklist`
