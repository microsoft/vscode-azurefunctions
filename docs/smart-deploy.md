# Smart Deploy

## Overview

The **Smart Deploy** command (`azureFunctions.smartDeploy`) intelligently routes a deploy action based on what infrastructure tooling the project uses. Projects with Azure Developer CLI (`azure.yaml`) get AZD-powered deployment; plain projects go straight to the traditional zip-deploy flow.

---

## User Flow

```
User clicks Deploy (editor title bar, tree view, or context menu)
      │
      ▼
Resolve project root
      │
      ▼
detectAzdProject()
      │
  ┌───┴──────────────────────────┬───────────────────────────┐
  │ azure.yaml exists             │ infra/*.bicep exists       │ plain
  │ (Tier 1: azd-functions)       │ but no azure.yaml          │ (Tier 3)
  │                               │ (Tier 2: bicep-only)       │
  ▼                               ▼                            ▼
Quick Pick                   Quick Pick                  runTraditionalDeploy()
  ├─ Deploy with azd up       ├─ Deploy to existing       (no prompt)
  │   (recommended)           │   Function App
  └─ Deploy to existing       └─ Initialize azd
      Function App
```

---

## Source Files

| File | Role |
|---|---|
| `src/commands/deploy/SmartDeploy.ts` | Full implementation |
| `src/commands/registerCommands.ts` | Registers `azureFunctions.smartDeploy` |

---

## Command Registration

```typescript
// src/commands/registerCommands.ts
import { smartDeploy } from './deploy/SmartDeploy';
registerCommand('azureFunctions.smartDeploy', smartDeploy);
```

---

## AZD Project Detection

### `detectAzdProject(projectRoot): AzdStatus`

```typescript
interface AzdStatus {
    tier: 'azd-functions' | 'bicep-only' | 'plain';
    hasFunctionService: boolean;  // azure.yaml has host: function
    hasInfra: boolean;            // infra folder with .bicep or .tf files
    hasAzureYaml: boolean;        // azure.yaml exists
}
```

**Detection logic:**

1. Check for `azure.yaml` in project root.
   - If present: regex `/host\s*:\s*["']?function["']?/i` on file content sets `hasFunctionService`.
   - Tier = `'azd-functions'`.
2. If no `azure.yaml`: check folders `infra/`, `infrastructure/`, `deploy/` for `.bicep` or `.tf` files.
   - If found: tier = `'bicep-only'`.
3. Otherwise: tier = `'plain'`.

---

## Tier Behavior

### Tier 1 — `azd-functions` (azure.yaml present)

Quick Pick title: **Deploy Function App**
Placeholder: *"This project includes Azure Developer CLI configuration (azure.yaml)"*

| Option | Detail | Action |
|---|---|---|
| `$(zap) Deploy with Azure Developer CLI (azd up)` | "Provisions infrastructure and deploys your code in one command" (or "Deploys using azure.yaml" if no infra) | `runAzdDeploy()` |
| `$(cloud-upload) Deploy to existing Function App` | "Zip-deploy to a Function App you choose in Azure" | `runTraditionalDeploy()` |

### Tier 2 — `bicep-only` (infra files but no azure.yaml)

Quick Pick title: **Deploy Function App**
Placeholder: *"Infrastructure files detected — azd can manage provisioning and deployment together"*

| Option | Detail | Action |
|---|---|---|
| `$(cloud-upload) Deploy to existing Function App` | "Zip-deploy to a Function App you choose in Azure" | `runTraditionalDeploy()` |
| `$(add) Initialize Azure Developer CLI for this project` | "Run azd init to enable one-command provisioning and deployment with your Bicep files" | `runAzdInit()` |

### Tier 3 — `plain` (no AZD artifacts)

No Quick Pick — goes directly to `runTraditionalDeploy()`.

---

## AZD Invocation Chain

### `runAzdDeploy(context, projectRoot)`

Tries in order:

1. **AZD VS Code extension** (`ms-azuretools.azure-dev`):
   ```typescript
   const ext = vscode.extensions.getExtension('ms-azuretools.azure-dev');
   if (ext) {
       await vscode.commands.executeCommand('azure-dev.commands.cli.up');
       return;
   }
   ```

2. **AZD CLI on PATH** (detected via `execSync('azd version', { stdio: 'pipe', timeout: 5000 })`):
   ```typescript
   const terminal = vscode.window.createTerminal({ name: 'Azure Developer CLI', cwd: projectRoot });
   terminal.show();
   terminal.sendText('azd up');
   ```

3. **Neither available** → `showAzdNotInstalledError()`:
   - Error message: *"Azure Developer CLI (azd) is not installed. Install the AZD extension or CLI to use one-command deployment."*
   - **Install AZD Extension** → `workbench.extensions.search` for `ms-azuretools.azure-dev`
   - **Install AZD CLI** → opens `https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd`

### `runAzdInit(resourceUri?)`

Same three-step chain but runs `azd init` instead of `azd up`.

### `runTraditionalDeploy(resourceUri?)`

Delegates entirely to the existing deploy command:
```typescript
await vscode.commands.executeCommand('azureFunctions.deployProject', resourceUri);
```

---

## UI Surfaces

### Editor title bar

```json
{
  "command": "azureFunctions.smartDeploy",
  "when": "editorIsOpen",
  "group": "navigation@1"
}
```

Appears **left of** the Validate button (`navigation@2`) whenever any file is open.

### Explorer context menu (right-click on folder)

```json
{
  "command": "azureFunctions.smartDeploy",
  "when": "explorerResourceIsFolder == true",
  "group": "zzz_azurefunctions@2"
}
```

### Tree view inline icon (Function App project nodes)

```json
{
  "command": "azureFunctions.smartDeploy",
  "when": "view == azFuncTree && viewItem == azFuncLocalProject",
  "group": "inline"
}
```

### Workspace actions submenu

```json
{
  "command": "azureFunctions.smartDeploy",
  "group": "2_deploy@2"
}
```

---

## Telemetry

| Property | Values | Description |
|---|---|---|
| `azdTier` | `'azd-functions'`, `'bicep-only'`, `'plain'` | Detection result |
| `deployPath` | `'azd'`, `'traditional-direct'`, `'traditional-from-azd-project'`, `'traditional-bicep-project'`, `'setup-azd'`, `'cancelled'` | Which path was taken |
| `azdInvocation` | `'extension'`, `'cli-terminal'`, `'not-installed'` | How AZD was invoked (Tier 1 only) |
| `azdNotInstalledChoice` | `'Install AZD Extension'`, `'Install AZD CLI'`, `'dismissed'` | User's choice when AZD is missing |

---

## package.json Changes

**Command definition:**
```json
{
  "command": "azureFunctions.smartDeploy",
  "title": "%azureFunctions.smartDeploy%",
  "category": "Azure Functions",
  "icon": "$(cloud-upload)",
  "enablement": "!virtualWorkspace"
}
```

**NLS string** (`package.nls.json`):
```json
"azureFunctions.smartDeploy": "Deploy Function App"
```
