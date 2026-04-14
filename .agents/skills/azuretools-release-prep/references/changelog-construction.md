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

## Step 2: Present the Interactive Selection List

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

## Step 3: Apply Deselections and Confirm

Parse the user's response:
- Empty / blank → keep all current selections
- Comma-separated numbers → mark those items as deselected (❌)

Re-render the updated list showing ✅ / ❌ for every item, then use `ask_user`:
- `"Looks good — generate the changelog (Recommended)"`
- `"I want to change more entries"`

If further changes are needed, loop back to Step 2 with the current selection state.

---

## Step 4: Generate and Display Changelog Entry

From the confirmed selected items, build the entry using [changelog-template.md](changelog-template.md) — use `REPO_REMOTE_URL` (captured in Phase 1) for all PR links.

Display the complete generated entry in the chat for the user to review before any files are written.

---

## Step 5: Prepend to CHANGELOG.md (Phase 4 only)

Insert the approved entry immediately after the `# Change Log` heading, above the previous release entry.

Verify placement with:

```bash
head -20 CHANGELOG.md
```
