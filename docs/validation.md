# Function App Validator (Copilot)

## Overview

The **Validate Function App** command (`azureFunctions.validateFunctionApp`) uses GitHub Copilot (via `vscode.lm`) to lint an Azure Functions project against a set of best-practice rules defined in Markdown skill files. Findings are surfaced as VS Code **Problems** panel diagnostics with clickable documentation links.

---

## Trigger Points

Validation runs automatically after project creation and can be re-run manually:

| Trigger | How |
|---|---|
| **Auto** | Fires automatically at the end of `_createProject` in `TemplateGalleryPanel.ts` after the project folder is opened |
| **Right-click (explorer)** | Right-click a folder → Azure Functions → Validate Function App |
| **Right-click (tree view)** | Right-click a local Function App project node → Validate Function App with Copilot |
| **Command Palette** | `Azure Functions: Validate Function App with Copilot` |

---

## User Flow

```
Project created (auto) OR user right-clicks and selects Validate
      │
      ▼
Resolve project root
      │
      ▼
Read local.settings.json → detect FUNCTIONS_WORKER_RUNTIME
      │
      ▼
Load skill files (functionapp.md + <runtime>.md)
      │
      ▼
Collect project files (host.json, local.settings.json,
  requirements.txt, .funcignore, up to 6 source files)
      │
      ▼
Call vscode.lm (GitHub Copilot gpt-4o or best available)
      │
      ▼
Parse JSON response  →  apply diagnostics to Problems panel
      │
      ▼
Show summary notification  +  log to output channel
```

---

## Source Files

| File | Role |
|---|---|
| `src/commands/validateFunctionApp/FunctionAppValidator.ts` | Main implementation — all validation logic |
| `resources/skills/functionapp.md` | Common best-practice rules for ALL runtimes |
| `resources/skills/python.md` | Python-specific rules |
| `src/extensionVariables.ts` | Exports `ext.diagnosticCollection` |
| `src/extension.ts` | Creates `vscode.languages.createDiagnosticCollection('Azure Functions')` |
| `src/commands/registerCommands.ts` | Registers `azureFunctions.validateFunctionApp` |

---

## Command Registration

```typescript
// src/commands/registerCommands.ts
import { validateFunctionApp } from './validateFunctionApp/FunctionAppValidator';
registerCommand('azureFunctions.validateFunctionApp', validateFunctionApp);
```

---

## DiagnosticCollection

Created once at extension activation:

```typescript
// src/extension.ts
ext.diagnosticCollection = vscode.languages.createDiagnosticCollection('Azure Functions');
context.subscriptions.push(ext.diagnosticCollection);
```

Cleared and repopulated on every validate run. Diagnostics include:
- `source: 'Azure Functions'`
- `code: { value: ruleCode, target: Uri.parse(docsUrl) }` — clickable link to Azure Functions docs

---

## Project Root Resolution

Priority order:
1. `resourceUri` argument (context menu invocation) — if file, uses its directory; if directory, uses it directly.
2. Active editor's workspace folder.
3. First workspace folder.

---

## Runtime Detection

Detection uses two strategies in priority order:

**1. `local.settings.json`** (explicit — preferred)
```json
{ "Values": { "FUNCTIONS_WORKER_RUNTIME": "python" } }
```

**2. File extension inference** (fallback — works for templates without `local.settings.json`)

Walks the project up to 2 levels deep and counts source files by extension:

| Extension | Inferred runtime |
|---|---|
| `.py` | `python` |
| `.js` / `.ts` | `node` |
| `.cs` | `dotnet` |
| `.java` | `java` |
| `.ps1` | `powershell` |

The runtime with the most matching files wins.

**Skill file mapping:**

| Runtime | Skill file |
|---|---|
| `python` | `python.md` |
| `node` | `node.md` |
| `dotnet` / `dotnet-isolated` | `dotnet.md` |
| `java` | `java.md` |
| `powershell` | `powershell.md` |

Only if both strategies fail does the command show a warning and exit early.

---

## Skill File Loading

Both files are concatenated and sent to the LLM as a single prompt:

```typescript
function loadSkillContent(runtime: string): string | undefined {
    // Always load common rules
    const commonPath = path.join(skillsDir, 'functionapp.md');
    // Load runtime-specific rules
    const runtimePath = path.join(skillsDir, runtimeToSkillFile[runtime]);
    // Concatenate: common first, then runtime-specific
    return `${commonContent}\n\n---\n\n${runtimeContent}`;
}
```

---

## Project File Collection

Files sent to the LLM for analysis:

| File | Notes |
|---|---|
| `host.json` | Always collected if present |
| `local.settings.json` | Always collected if present |
| `requirements.txt` | Always collected if present |
| `.funcignore` | Always collected if present |
| Source files | Up to 6 files, by runtime extension (`.py`, `.js`, `.ts`, `.cs`, `.java`, `.ps1`) |
| `function.json` | Collected for v1 model detection |

Each file is truncated to 4,000 characters to stay within token budget.

---

## LLM Call

```typescript
// Prefer gpt-4o; fall back to any Copilot model
let models = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
if (!models.length) models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
```

**If no Copilot model is available:**

An error message is shown:
> "Azure Functions validation requires GitHub Copilot. Install the GitHub Copilot extension and sign in, then try again."

With an **Install GitHub Copilot** button that runs:
```typescript
vscode.commands.executeCommand('workbench.extensions.search', 'GitHub.copilot')
```

---

## LLM Response Schema

The skill files instruct the LLM to return **only** valid JSON in this shape:

```json
{
  "findings": [
    {
      "rule": "AF001",
      "severity": "warning",
      "file": "host.json",
      "line": 5,
      "message": "Extension bundle version [2.*, 3.0.0) is outdated. Upgrade to [4.*, 5.0.0)."
    }
  ]
}
```

The parser strips markdown fences if the model wraps its JSON in a code block:

```typescript
const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
```

---

## UI Surfaces

The Validate command is accessible in three places (the editor title bar button and tree view inline icon were removed — validation now runs automatically on project creation):

### Auto-validate on project creation
```typescript
// src/commands/createNewProject/TemplateGalleryPanel.ts
// After project folder is opened:
void vscode.commands.executeCommand('azureFunctions.validateFunctionApp', vscode.Uri.file(projectPath));
```

### Explorer context menu (right-click on folder)
```json
{
  "command": "azureFunctions.validateFunctionApp",
  "when": "explorerResourceIsFolder == true",
  "group": "zzz_azurefunctions@3"
}
```

### Workspace actions submenu (right-click on local project node)
```json
{
  "command": "azureFunctions.validateFunctionApp",
  "group": "3_validate@1"
}
```

---

## Summary Notification

After validation:
- **No findings**: Info message — "No issues found. Your project follows best practices!"
- **Findings present**: Warning message with counts — "Found 2 error(s), 1 warning(s). See the Problems panel for details." with an **Open Problems** button.

All findings are also logged to the Azure Functions output channel.

---

## Telemetry

| Property/Measurement | Description |
|---|---|
| `runtime` | Detected worker runtime |
| `llmModel` | Copilot model used |
| `fileCount` | Number of project files sent to LLM |
| `findingCount` | Total findings returned |
| `errorCount` | Findings with severity "error" |
| `warningCount` | Findings with severity "warning" |

---

## Adding a New Runtime

1. Create `resources/skills/<runtime>.md` following the same rule format as `python.md`.
2. Add an entry to `runtimeToSkillFile` in `FunctionAppValidator.ts`:
   ```typescript
   const runtimeToSkillFile: Record<string, string> = {
       python: 'python.md',
       node: 'node.md',       // ← add here
       ...
   };
   ```
3. The rest of the validation pipeline picks it up automatically.
