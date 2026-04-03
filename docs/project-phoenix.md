# Project Phoenix — Change Log

This document is the authoritative record of every feature, enhancement, and bug fix introduced under **Project Phoenix** — the initiative to modernise the Azure Functions VS Code extension's "Create New Project" experience.

Any agent or developer working in this codebase should read this document first to understand the scope of changes and which files were touched. Cross-references to the detailed feature docs in this folder are provided throughout.

---

## Overview

Project Phoenix introduced a brand-new **Template Gallery** webview experience for creating Azure Functions projects, alongside several companion features: AI-powered validation, Copilot-assisted code generation, smart deployment routing, a one-click Run button, and a Go language runtime. All new surface area is opt-in — the classic wizard remains the default.

---

## 1. Template Gallery Webview

**Full doc:** [template-gallery.md](./template-gallery.md)

### What was built

A full-screen VS Code webview panel (`TemplateGalleryPanel`) that replaces the step-by-step Quick Pick wizard when `azureFunctions.enableTemplateGallery` is enabled.

| Area | Detail |
|---|---|
| **Entry point** | `src/commands/createNewProject/TemplateGalleryPanel.ts` |
| **Webview assets** | `resources/webviews/templateGallery/main.js`, `styles.css` |
| **Manifest service** | `src/templates/projectTemplates/ProjectTemplateProvider.ts` |
| **Data model** | `src/templates/projectTemplates/IProjectTemplate.ts` |

### Template manifest

- Manifest served from Azure CDN: `https://cdn.functions.azure.com/public/templates-manifest/manifest.json`
- 24-hour `globalState` cache with bundled offline fallback (`resources/backupProjectTemplates/manifest.json`)
- Manifest schema normalisation: accepts `language` (string) or `languages` (array), `category` or `categories`, `displayName`/`name`/`title`, `description`/`shortDescription`

### Language filters

Filter chips on the gallery sidebar cover: **Python**, **JavaScript**, **TypeScript**, **C# (.NET)**, **Java**, **PowerShell**, **Go**. JavaScript and TypeScript are split into separate chips (not grouped as "Node"). Each chip has a distinct brand colour.

### Categories

| Manifest value | Display label |
|---|---|
| `starter` | Starter |
| `web-apis` | Web APIs |
| `event-processing` | Event Processing |
| `scheduling` | Scheduled Tasks |
| `ai-ml` | AI & Machine Learning |
| `data-processing` | Data Processing |
| `workflows` | Orchestrations |
| `other` | Other |

Note: the manifest uses `scheduling` (not `scheduled-tasks`) and the display label "Orchestrations" (not "Workflows") — the extension maps these correctly.

### Clone flow

Templates are cloned via `git clone --depth 1 --sparse` into `os.tmpdir()` staging then copied to the user's chosen folder. Key behaviour:

- `folderPath: "."` → full repo clone (no sparse checkout)
- `folderPath: "some/sub/folder"` → sparse checkout of that path only
- Always clones to a temp directory first to avoid "destination already exists" errors
- Removes `.git` after copy

### Single-language display

When a template supports only one language the language selector is rendered as static text, not a dropdown.

---

## 2. Feature Flag / Opt-in Setting

**Doc section:** [template-gallery.md — Feature Flag](./template-gallery.md#feature-flag--opt-in-setting)

The Template Gallery is **disabled by default**. The existing wizard flow is unchanged for all users who have not opted in.

| Setting | Type | Default |
|---|---|---|
| `azureFunctions.enableTemplateGallery` | `boolean` | `false` |

Enable in `settings.json`:
```json
"azureFunctions.enableTemplateGallery": true
```

Branch logic lives in `src/commands/createNewProject/createNewProject.ts` (`createNewProjectFromCommand`). Programmatic callers (`templateId`, `startFromScratch`) always bypass the gallery.

---

## 3. Go Language Support

**Files changed:**
- `manifest.json` (local) — 12 Go templates added
- `resources/webviews/templateGallery/main.js` — `languageFilterMap` and `languageDisplayNames` updated
- `resources/webviews/templateGallery/styles.css` — Go colour `#00ADD8`

Go templates source: `https://github.com/Azure/azure-functions-golang-worker` (`samples/` subfolder).

Templates added: `httpTrigger`, `timerTrigger`, `blobTrigger`, `cosmosDBTrigger`, `eventGridTrigger`, `eventHubTrigger`, `serviceBusQueueTrigger`, `serviceBusTopicTrigger`, `httpBlobInput`, `httpEventHubOutput`, `httpServiceBusOutput`, `httpStreaming`.

---

## 4. Copilot-Assisted Project Creation

**Full doc:** [copilot-creation.md](./copilot-creation.md)

A **"Generate with Copilot"** tab in the Template Gallery lets users describe a project in plain English. The extension calls `vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' })`, sends a language-grounded prompt, and writes the returned file scaffold to disk.

Prompt includes per-language grounding (programming model, packages, runtime value, canonical file names) plus Azure Functions best practices (stateless, output bindings, async patterns, no hardcoded secrets, Managed Identity).

---

## 5. Function App Validator

**Full doc:** [validation.md](./validation.md)

### What was built

Command `azureFunctions.validateFunctionApp` — sends project files to GitHub Copilot (gpt-4o) along with Markdown skill files from `resources/skills/`. Findings are surfaced as VS Code **Problems** panel diagnostics with clickable doc links.

### UI surface changes

| Surface | Status |
|---|---|
| Editor title bar toolbar button | **Removed** — was `navigation@2` in `editor/title` |
| Tree view inline icon | **Removed** — was `group: "inline"` in `view/item` |
| Right-click on folder (Explorer) | **Kept** |
| Right-click on tree node (workspace view) | **Kept** |
| Command Palette | **Kept** |
| **Auto-validate on project creation** | **Added** — fires after `_createProject` in `TemplateGalleryPanel.ts` |

### Runtime detection (no `local.settings.json` required)

1. Read `FUNCTIONS_WORKER_RUNTIME` from `local.settings.json` (primary)
2. Infer from file extensions if file missing (`.py`→python, `.js`/`.ts`→node, `.cs`→dotnet, `.java`→java, `.ps1`→powershell)

---

## 6. Run Function App

**Full doc:** [run-function-app.md](./run-function-app.md)

One-click `func start` via the editor title bar (▶) and command palette. For Python projects the extension:

1. Creates/detects a `.venv` virtual environment
2. Runs `pip install -r requirements.txt`
3. Opens an **"Azure Functions: Run"** terminal

### Python venv / terminal interference fix

VS Code's Python extension auto-sends `& Activate.ps1` to every new terminal, injecting a newline that reached `func start`'s stdin and caused it to exit. The fix uses a custom `Pseudoterminal` (`FuncStartTerminal`) that:

- Spawns `func start` as a direct child process with `stdio: ['pipe', 'pipe', 'pipe']`
- Sets `VIRTUAL_ENV` and prepends venv `Scripts/bin` to `PATH` in the child's environment
- Routes `handleInput()` calls (where Python extension's text lands) to a no-op — the injected newline can never reach the process
- Supports Ctrl+C to gracefully kill the process tree (`taskkill /f /t` on Windows)
- Shows exit code and "press any key to close" after process ends

### URI fix

`walkThrough://` URI scheme was causing `resourceUri.fsPath` to throw. Fixed by guarding: `if (resourceUri?.scheme === 'file')` before calling `fsPath`.

---

## 7. Smart Deploy

**Full doc:** [smart-deploy.md](./smart-deploy.md)

AZD-aware deployment routing:

| Tier | Detection | Action |
|---|---|---|
| 1 | `azure.yaml` present | `azd up` |
| 2 | `infra/*.bicep` present | `azd init` |
| 3 | Plain project | Traditional zip-deploy |

---

## 8. Skill Files

**Full doc:** [skill-files.md](./skill-files.md)

Markdown files in `resources/skills/` define best-practice rules (e.g. `AF001`, `AF050`) sent to the LLM during validation. Adding a new rule requires only editing Markdown — no code changes.

---

## Files Changed Summary

| File | Change |
|---|---|
| `src/commands/createNewProject/createNewProject.ts` | Feature flag branch — gallery vs wizard |
| `src/commands/createNewProject/TemplateGalleryPanel.ts` | New webview panel, clone logic, auto-validate hook |
| `src/commands/createNewProject/CloneTemplateStep.ts` | Sparse checkout, `os.tmpdir()` staging, `folderPath: "."` handling |
| `src/commands/createNewProject/TemplateListStep.ts` | Category/language filter display |
| `src/commands/validateFunctionApp/FunctionAppValidator.ts` | Runtime inference from file extensions, removed toolbar/inline buttons |
| `src/commands/runFunctionApp/RunFunctionApp.ts` | `FuncStartTerminal` PTY, venv env injection, `walkThrough://` URI fix |
| `src/templates/projectTemplates/ProjectTemplateProvider.ts` | CDN manifest URL, manifest normalisation, local-file TEMP check removed |
| `src/templates/projectTemplates/IProjectTemplate.ts` | `TemplateCategory` enum (`scheduling`, `workflows`), `TemplateCategory.Workflows` label |
| `src/vsCodeConfig/verifyInitForVSCode.ts` | Related init fixes |
| `src/vsCodeConfig/verifyVSCodeConfigOnActivate.ts` | Related activation fixes |
| `resources/webviews/templateGallery/main.js` | Language filter chips (JS/TS split, Go added), single-language static text, category display |
| `resources/webviews/templateGallery/styles.css` | Language badge colours, filter chip styles |
| `manifest.json` (extension root) | 81 templates — 69 existing + 12 Go templates (temp/testing file) |
| `package.json` | `azureFunctions.enableTemplateGallery` setting, removed validate toolbar/inline menu entries |
| `package.nls.json` | Localisation string for new setting |
| `docs/template-gallery.md` | Full gallery architecture doc |
| `docs/copilot-creation.md` | Copilot generation doc |
| `docs/validation.md` | Validator doc (updated for auto-validate, runtime inference, UI changes) |
| `docs/run-function-app.md` | Run button doc (PTY approach, venv activation) |
| `docs/skill-files.md` | Skill files reference |
| `docs/smart-deploy.md` | Smart deploy doc |
| `docs/project-phoenix.md` | This document |
| `CLAUDE.md` | Updated with all new docs and key rules |

---

## Key Architectural Decisions

### Why a webview instead of extending the wizard?

The Quick Pick wizard UI cannot support rich filtering, previews, or multi-tab layout. A webview gives full control over the gallery UX while the wizard remains intact for programmatic callers and the classic flow.

### Why opt-in by default?

The gallery depends on an external CDN manifest. Shipping it as the default immediately would break users on restricted networks or if the CDN is unavailable. The opt-in flag lets us validate the CDN manifest quality and template clone reliability with a subset of users before promoting to default.

### Why a Pseudoterminal for Python `func start`?

VS Code's Python extension intercepts every new shell terminal and sends `& Activate.ps1` via `sendText`. This is unkillable via env vars or timing hacks because the Python extension uses shell integration events, not a fixed delay. A `Pseudoterminal` receives `sendText` calls via `handleInput()`, which we control — injected text is silently dropped, and `func start`'s process stdin is a pipe we never write to.

### Why file-extension runtime inference?

Templates created from the gallery may not include `local.settings.json`. Rather than requiring users to create the file before validation works, the validator falls back to counting source files by extension (`.py`, `.ts`, `.cs`, etc.) to infer the runtime. This makes auto-validation on project creation work out of the box.
