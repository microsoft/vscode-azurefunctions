# Changelog Entry Template

## Format

```markdown
## X.Y.Z - YYYY-MM-DD

### Overview
_Optional. Include for minor/major releases with a clear theme. 1–2 sentences. Omit for patch releases._

### Added
* [[PR#](<REPO_REMOTE_URL>/pull/PR#)] Description — **bold** key terms

### Changed
* [[PR#](<REPO_REMOTE_URL>/pull/PR#)] Description

### Fixed
* [[PR#](<REPO_REMOTE_URL>/pull/PR#)] Description

### Security
* [[PR#](<REPO_REMOTE_URL>/pull/PR#)] Description

### Engineering
* [[PR#](<REPO_REMOTE_URL>/pull/PR#)] Description
```

`REPO_REMOTE_URL` is captured in Phase 1 (see [branch-setup.md](branch-setup.md)).

Omit any section that has no entries.

---

## Rules

- Link format: `[[PR#](<REPO_REMOTE_URL>/pull/PR#)]`
- Active voice, imperative mood: "Add", "Fix", "Support", "Remove" — not "Added", "Fixed"
- **Bold** key feature/setting names
- One sentence per entry, two at most
- Date format: `YYYY-MM-DD`

---

## Example

_Using `vscode-azurefunctions` as the example repo:_

```markdown
## 1.22.0 - 2026-05-01

### Overview
This release brings consumption plan support, improved scheduler creation, and bug fixes for containerized workflows.

### Added
* [[4951](https://github.com/microsoft/vscode-azurefunctions/pull/4951)] Support **DTS consumption plan** and remove preview flag

### Changed
* [[4946](https://github.com/microsoft/vscode-azurefunctions/pull/4946)] Open sample file and `mcp.json` in split editor when creating **self-hosted MCP projects**

### Fixed
* [[4971](https://github.com/microsoft/vscode-azurefunctions/pull/4971)] Fix resource group default name and auto-refresh after deletion

### Engineering
* [[4947](https://github.com/microsoft/vscode-azurefunctions/pull/4947)] Replace JsonCli tool with direct nupkg parsing and native `dotnet new`
```
