# Project Template Gallery

## Overview

The Template Gallery is a manifest-driven system that lets users start a new Azure Functions project from a curated, ready-to-run template rather than building from scratch. Templates are hosted in remote Git repositories and include working code, tests, and Bicep infrastructure files.

---

## User Flow

```
Create New Project
      │
      ▼
NewProjectLanguageStep  ──► select language (Python, TypeScript, …)
      │
      ▼
StartingPointStep
  ┌───┴────────────────────────┐
  │ Start from template        │  Start from scratch
  │ (template flow)            │  (existing trigger-selection flow)
  └───────────┬────────────────┘
              ▼
        TemplateListStep
          (Quick Pick, grouped by category)
              │
              ▼
        CloneTemplateStep
          (git clone → temp dir → copy to project path)
              │
              ▼
        PostCloneStep
          (detect Bicep files, show notifications)
```

---

## Source Files

| File | Role |
|---|---|
| `src/commands/createNewProject/StartingPointStep.ts` | Wizard step — prompts "template vs scratch"; routes to `TemplateListStep` or `FunctionListStep` |
| `src/commands/createNewProject/TemplateListStep.ts` | Wizard step — loads and displays templates grouped by category |
| `src/commands/createNewProject/CloneTemplateStep.ts` | Execute step — `git clone --depth 1`, removes `.git`, copies to project path |
| `src/commands/createNewProject/PostCloneStep.ts` | Execute step — detects Bicep files, shows post-clone notifications |
| `src/commands/createNewProject/IProjectWizardContext.ts` | Context interface — adds `startingPoint`, `selectedTemplate`, `clonedFromTemplate`, `hasBicepFiles` |
| `src/templates/projectTemplates/IProjectTemplate.ts` | Data model — `IProjectTemplate`, `ITemplateManifest`, `TemplateCategory` enum, `IPrerequisite` |
| `src/templates/projectTemplates/ProjectTemplateProvider.ts` | Service — fetches manifest (remote → cache → bundled fallback), filters by language/model |

---

## Template Manifest

Templates are described in a JSON manifest served from Azure CDN. The manifest URL is configured in `ProjectTemplateProvider.DEFAULT_MANIFEST_URL` and can be overridden via VS Code settings.

### Manifest Schema

```json
{
  "version": "1.0",
  "generatedAt": "2024-01-01T00:00:00Z",
  "templates": [
    {
      "id": "python-http-starter",
      "displayName": "HTTP Starter (Python)",
      "shortDescription": "A simple HTTP-triggered Azure Function",
      "categories": ["starter"],
      "languages": ["Python"],
      "languageModels": { "Python": [2] },
      "repositoryUrl": "https://github.com/org/template-repo",
      "subdirectory": "python/http",
      "branch": "main",
      "prerequisites": [
        {
          "id": "func-core-tools",
          "displayName": "Azure Functions Core Tools",
          "detectionCommand": "func --version",
          "required": true,
          "installUrl": "https://learn.microsoft.com/azure/azure-functions/functions-run-local"
        }
      ],
      "tags": ["http", "rest", "api"],
      "icon": "globe",
      "priority": 1,
      "isPopular": true
    }
  ]
}
```

### `IProjectTemplate` Fields

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier |
| `displayName` | `string` | Label shown in Quick Pick |
| `shortDescription` | `string` | One-line description (Quick Pick detail) |
| `categories` | `TemplateCategory[]` | Categories for grouping (a template can belong to multiple) |
| `languages` | `ProjectLanguage[]` | Supported languages |
| `languageModels` | `Record<ProjectLanguage, number[]>` | Supported programming models per language |
| `repositoryUrl` | `string` | Git URL for `git clone` |
| `subdirectory` | `string?` | Subfolder within the repo if not at root |
| `branch` | `string?` | Branch to clone (default: `main`) |
| `prerequisites` | `IPrerequisite[]` | Required tools (checked before cloning) |
| `tags` | `string[]` | Shown in Quick Pick detail line |
| `icon` | `string?` | VS Code codicon name (no `$()` wrapper) |
| `priority` | `number?` | Sort order within category (lower = first) |
| `isNew` | `boolean?` | Renders `$(sparkle)` badge |
| `isPopular` | `boolean?` | Renders `$(star-full)` badge |

### Template Categories

| Enum value | Display label |
|---|---|
| `starter` | Starter |
| `web-apis` | Web APIs |
| `event-processing` | Event Processing |
| `scheduled-tasks` | Scheduled Tasks |
| `ai-ml` | AI & Machine Learning |
| `data-processing` | Data Processing |
| `workflows` | Workflows |
| `other` | Other |

---

## ProjectTemplateProvider — Caching & Fallback

```
getTemplates()
  └─► getManifest()
        ├─ globalState cache valid?  ──► return cached manifest
        ├─ fetch from DEFAULT_MANIFEST_URL
        │    ├─ merge additionalManifestUrls (settings)
        │    └─ cache result in globalState with timestamp
        └─ fallback to resources/backupProjectTemplates/manifest.json
```

**Cache settings** (VS Code settings, prefix `azureFunctions.projectTemplates`):

| Setting | Default | Description |
|---|---|---|
| `manifestUrl` | CDN URL | Primary manifest URL |
| `additionalManifestUrls` | `[]` | Additional manifests to merge (org-specific) |
| `cacheExpirationHours` | `24` | Hours before cached manifest is refreshed |
| `preferTemplateFlow` | `true` | Pre-selects "Start from template" in wizard |
| `showBicepPrompt` | `true` | Shows Bicep notification after clone |

---

## Clone Flow (CloneTemplateStep)

1. Creates a temp directory under `ext.context.globalStorageUri/tempClone/<timestamp>`.
2. Runs `git clone --depth 1 --branch <branch> <repositoryUrl> <tempDir>`.
3. If `template.subdirectory` is set, uses that as the source root.
4. Removes `.git` directory.
5. Copies all files to the user's chosen `projectPath`.
6. Cleans up the temp directory (even on error).
7. Records `cloneSuccess`, `cloneError`, and `cloneDurationMs` in telemetry.

**Error handling** maps common git error patterns to user-friendly messages:
- Authentication errors → prompt to check repo access
- 404 / not found → repo may have moved
- Network errors → check internet connection

---

## Post-Clone Actions (PostCloneStep)

After a successful clone:

1. **Bicep detection**: Scans `infra/`, `infrastructure/`, `deploy/`, and project root for `.bicep` files.
   - If found and `showBicepPrompt` is enabled: shows an info notification with **Deploy Infrastructure** and **View Bicep Files** actions.
2. **README detection**: Looks for `README.md` (case-insensitive).
   - If found: shows a welcome notification with **Open README** and **Start Debugging (F5)** actions.

---

## Wiring — package.json

The `StartingPointStep` is inserted into the existing `createNewProject` wizard in `createNewProject.ts`. No new top-level command is needed — the template path is a branch within the existing wizard.

**VS Code settings** added to `package.json` `contributes.configuration`:

```json
"azureFunctions.projectTemplates.manifestUrl": { ... }
"azureFunctions.projectTemplates.additionalManifestUrls": { ... }
"azureFunctions.projectTemplates.cacheExpirationHours": { ... }
"azureFunctions.projectTemplates.preferTemplateFlow": { ... }
"azureFunctions.projectTemplates.showBicepPrompt": { ... }
```
