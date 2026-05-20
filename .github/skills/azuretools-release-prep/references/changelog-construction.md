# Changelog Construction

## Step 1: Build the Candidate List

Map every commit since `LAST_TAG` to a category using [commit-classification.md](commit-classification.md).

For each commit extract:
- Index number (1-based, for user deselection)
- PR number from trailing `(#NNNN)` — note if absent
- Cleaned subject line (strip trailing `(#NNNN)`)
- Category: `ADDED`, `CHANGED`, `FIXED`, `ENGINEERING`, or `SKIP`
- Flag: `⚠️` on all `SKIP` items

**Dep bump pre-consolidation:** Before building the list, collect all dep bump / upgrade commits (the `Bump` and `Upgrade` patterns from the SKIP table) and collapse them into **one synthetic entry**:
```
⚠️  N.  [#AAA, #BBB, …]  Bumped N dependencies  →  Engineering (consolidated)
```
The remaining `SKIP` items (CI changes, release prep, npm audit fix) each appear as their own ⚠️ line.

---

## Step 2: Filter Fixes Irrelevant to the Last Stable Release

Before presenting the list, review every commit classified as `FIXED` and ask: **did this bug exist in the last stable release?**

A fix belongs in the changelog only if the bug it addresses was present in the previously-shipped stable version. If the bug was introduced after the last stable tag — meaning it was introduced and resolved entirely within this development cycle — it has no relevance to users of that release and should be reclassified to `SKIP`.

**Signals that a fix is NOT relevant to the last stable release:**
- The commit message explicitly references another commit or PR from this cycle as the source of the bug (e.g. `"follow-up to #X"`, `"fix regression from #X"`, `"introduced by #X"`) — confirm `#X` is in the current commit range
- The commit message contains language like `"fix regression introduced by"`, `"follow-up fix for the new"`, or `"fix issue with recently added"` and the described feature clearly landed in this cycle
- The thing being fixed is a feature or behavior that was `ADDED` in this same commit range and has no prior stable-release equivalent

**When in doubt, keep the fix.** Only reclassify to `SKIP` when there is clear evidence the bug never existed in a stable release.

Reclassified commits appear in the selection list as:
```
⚠️  N.  [#NNNN] <subject>  →  SKIP (fix for a bug introduced in this release)
```

---

## Step 3: Present the Interactive Selection List

Show every commit as a numbered, pre-selected list. All items start checked (✅).
Items the agent recommends skipping are marked ⚠️ but remain checked — the user decides.

```
All entries are selected. Items marked ⚠️ are suggested skips — deselect by number if you agree.

  ✅  1.  [#NNNN] <subject>  →  Added
  ✅  2.  [#NNNN] <subject>  →  Fixed
  ✅  3.  [#NNNN] <subject>  →  Changed
  ⚠️  4.  [#NNNN] <subject>  →  routine dependency bump
  ⚠️  5.  [#NNNN] <subject>  →  meta commit (release prep)
  ✅  6.  [#NNNN] <subject>  →  Engineering
  ⚠️  7.  [#NNNN] <subject>  →  CI-only change
  ...

Enter the numbers you'd like to REMOVE (comma-separated), or press Enter to accept as shown:
```

Use `ask_user` with `allow_freeform: true` and no choices (free text input).

---

## Step 4: Apply Deselections and Confirm

Parse the user's response:
- Empty / blank → keep all current selections
- Comma-separated numbers → mark those items as deselected (❌)

Re-render the updated list showing ✅ / ❌ for every item, then use `ask_user`:
- `"Looks good — generate the changelog (Recommended)"`
- `"I want to change more entries"`

If further changes are needed, loop back to Step 3 with the current selection state.

---

## Step 5: Generate Changelog Preview File

From the confirmed selected items, build the entry using [changelog-template.md](changelog-template.md) — use `REPO_REMOTE_URL` (captured in Phase 1) for all PR links.

**Save the generated entry to the session state folder** (do NOT write to the workspace yet):

```
~/.copilot/session-state/<SESSION_ID>/changelog-preview-<REPO_NAME>-<NEW_VERSION>.md
```

The file should contain only the new changelog entry (not the full CHANGELOG.md).

Then present the preview to the user:
1. Display the full generated entry inline in the chat
2. Print the path to the preview file so the user can open it

Use `ask_user` with:
- `"Apply this changelog entry (Recommended)"` — proceeds to Phase 4
- `"I want to revise the commit selection"` — loops back to Step 3

> ❌ **Do not write to `CHANGELOG.md` until the user explicitly approves.**

---

## Step 6: Prepend to CHANGELOG.md (Phase 4 only)

Read the approved entry from the session preview file written in Step 5, then insert it immediately after the `# Change Log` heading, above the previous release entry.

Verify placement with:

```bash
head -20 CHANGELOG.md
```
