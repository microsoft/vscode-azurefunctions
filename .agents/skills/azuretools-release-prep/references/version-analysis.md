# Version Analysis

## Step 1: Find Last Stable Tag and Current Version

```bash
# Find last stable release tag (skip pre-releases)
git tag --sort=-version:refname | grep -v alpha | grep -v beta | grep -v rc | head -5

# Get current version from package.json
cat package.json | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])"
```

Store as `LAST_TAG` and `CURRENT_VERSION`.

---

## Step 2: Collect Commits Since Last Tag

```bash
git log <LAST_TAG>..HEAD --oneline
```

---

## Step 3: Present Recommendation and Ask User to Choose

Classify commits using [commit-classification.md](commit-classification.md), then apply these bump rules:

| Bump | When |
|------|------|
| **Major** `X.0.0` | Breaking change, removed feature, incompatible config/API change, dropped runtime support |
| **Minor** `X.Y.0` | Any new user-facing feature, new command/template/trigger, preview → GA |
| **Patch** `X.Y.Z` | Bug fixes only — no new functionality |

> **Most releases are minor.** If there is at least one `ADDED` commit, default to minor. Major is rare — only when an existing user workflow breaks.

Present this summary:

```
## Version Bump Analysis (since <LAST_TAG>)

Current version: <CURRENT_VERSION>

Commit breakdown:
  - X new features          → Added
  - Y behavior changes      → Changed
  - Z bug fixes             → Fixed
  - W dep bumps / CI        → skip
  - V breaking changes      → potential major

Key new features:
  - <list most significant Added items>

Recommendation: <MAJOR|MINOR|PATCH> bump → <NEXT_VERSION>
Reasoning: <one paragraph explaining why>
```

Then use `ask_user` with choices:
- `"<X.Y+1.0> — minor (Recommended)"` (adjust label to match actual recommendation)
- `"<X.Y.Z+1> — patch"`
- `"<X+1.0.0> — major"`

Store the confirmed version as `NEW_VERSION`.

---

## Step 4: Apply Version Bump (Phase 4 only)

After changelog is approved, update `package.json`:

```bash
# Verify after edit
cat package.json | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])"
```
