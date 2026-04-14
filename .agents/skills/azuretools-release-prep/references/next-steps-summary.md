# Next Steps Summary

## Output File

Generate a markdown file **outside the workspace** at:

```
~/.copilot/session-state/<session-id>/release-prep-<REPO_NAME>-<NEW_VERSION>.md
```

Print the file path to the chat so the user can open it directly.

---

## GDPR URL

Before writing the file, construct `GDPR_URL` from `package.json`:

```
publisher = <publisher field>
name      = <name field>
GDPR_URL  = https://gdpr.datasmart.ms/?q=EntityName%20like%20%27<publisher>.<name>%25%27%20AND%20Complete%20=%200
```

Example for this repo (`ms-azuretools` / `vscode-azurefunctions`):
```
https://gdpr.datasmart.ms/?q=EntityName%20like%20%27ms-azuretools.vscode-azurefunctions%25%27%20AND%20Complete%20=%200
```

---

## File Template

```markdown
# Release Prep Summary — <REPO_NAME> <NEW_VERSION>

## What Was Done
- Branched from latest main → `<BRANCH_NAME>`
- Bumped version to `<NEW_VERSION>` in `package.json`
- Updated `CHANGELOG.md`
- Draft PR opened: <PR_URL>
- Draft Release created: <RELEASE_URL>

## Next Steps

For a comprehensive breakdown of next steps, see the **[release checklist issue](<CHECKLIST_ISSUE_URL>)**. Mark and close-out this issue once release is complete.

For a quick high-level summary of next steps:

- [ ] Update `NOTICE.html` — [Component Governance](https://dev.azure.com/devdiv/DevDiv/_componentGovernance)
- [ ] Merge Release Prep PR
- [ ] Publish draft release — update the tag to the version tag created by the CI run, then remove draft status
- [ ] Review telemetry categorization — [open GDPR dashboard](<GDPR_URL>)
- [ ] Publish through the ADO pipeline — [Azure Tools VS Code Extension Releases](https://dev.azure.com/devdiv/DevDiv/_build?definitionScope=%5CAzure%20Tools%5CVSCode&treeState=XEF6dXJlIFRvb2xzXFZTQ29kZVxFeHRlbnNpb24gUmVsZWFzZXMkXEF6dXJlIFRvb2xzXFZTQ29kZVxFeHRlbnNpb24gUGFja3MkXEF6dXJlIFRvb2xzXFZTQ29kZVxFeHRlbnNpb25z)
```
