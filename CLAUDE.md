# CLAUDE.md — Azure Functions VS Code Extension

## Project Overview

**Azure Functions** (`vscode-azurefunctions`) is a VS Code extension for creating, debugging, and deploying Azure Functions. It is published by `ms-azuretools` and lives at [github.com/Microsoft/vscode-azurefunctions](https://github.com/Microsoft/vscode-azurefunctions).

- **Language**: TypeScript
- **Bundler**: esbuild (see `esbuild.mjs`)
- **Linting**: ESLint (`eslint.config.mjs`)
- **Engine**: VS Code `^1.104.0`

## Repository Layout

```
src/                  → Extension source (TypeScript)
  commands/           → Command implementations (createNewProject, deploy, validate, …)
  debug/              → Debug configuration providers
  templates/          → Template engine and project template logic
  tree/               → Azure tree view data providers
  utils/              → Shared utilities
  workspace/          → Workspace detection and configuration
test/                 → Unit and integration tests
resources/            → Static assets bundled into the VSIX
  skills/             → Markdown skill files consumed by the LLM validator
  webviews/           → Webview HTML/CSS/JS (Template Gallery)
  backupTemplates/    → Offline fallback function templates
  backupProjectTemplates/ → Offline fallback project template manifest
docs/                 → Feature documentation (see below)
tools/                → Build-time tooling (JsonCli)
scripts/              → Build/test helper scripts
```

## Key Rules

- **Never commit or suggest changes to `main.js`.**

## Build & Development

```bash
npm install
npm run build          # Full build
npm run build:esbuild  # esbuild only
npm run build:check    # TypeScript type-checking only
```

Watch modes (VS Code tasks):
- **Watch: ESBuild** — `npm run build:esbuild -- --watch`
- **Watch: Check Types** — `npm run build:check -- --watch`

## Feature Documentation

Detailed design docs live in the `docs/` folder. Read these before working on the corresponding feature areas:

| Doc | Description |
|---|---|
| [docs/template-gallery.md](docs/template-gallery.md) | **Project Template Gallery** — manifest-driven template system, UI wiring, clone flow, and offline fallback |
| [docs/copilot-creation.md](docs/copilot-creation.md) | **AI / Copilot-assisted project creation** — Generate with Copilot tab, dual-path UX, LLM invocation, webview message protocol |
| [docs/validation.md](docs/validation.md) | **Function App Validator** — LLM-powered linting with per-runtime skill files, diagnostics integration |
| [docs/smart-deploy.md](docs/smart-deploy.md) | **Smart Deploy** — AZD-aware deployment routing (Tier 1/2/3), UI surfaces, telemetry |
| [docs/skill-files.md](docs/skill-files.md) | **Skill Files reference** — rules in `resources/skills/` consumed by the validator, rule format, how to add new rules/runtimes |
| [docs/run-function-app.md](docs/run-function-app.md) | **Run Function App** — one-click `func start`, Python venv setup, why env vars are used instead of activate scripts |

## Key Commands

| Command ID | Description |
|---|---|
| `azureFunctions.createNewProject` | Create a new Functions project (template gallery or from scratch) |
| `azureFunctions.validateFunctionApp` | LLM-powered project validation via Copilot |
| `azureFunctions.smartDeploy` | AZD-aware deploy routing |
| `azureFunctions.deployProject` | Traditional zip-deploy to a Function App |

## Architecture Highlights

### Template Gallery
The `createNewProject` wizard includes a `StartingPointStep` that branches into either "Start from template" (manifest-driven, cloned from Git) or "Start from scratch" (existing trigger-selection flow). Templates are fetched from a CDN manifest with globalState caching and a bundled fallback.

### Copilot Integration
Two Copilot-powered features:
1. **Generate with Copilot** — webview tab in the Template Gallery that sends a user prompt to `vscode.lm`, receives a JSON file scaffold, and writes it to disk.
2. **Function App Validator** — reads project files + skill Markdown rules, sends them to the LLM, and maps findings to VS Code diagnostics in the Problems panel.

Both features use `vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' })` with a fallback to any available Copilot model.

### Smart Deploy
Detects `azure.yaml` (Tier 1), `infra/*.bicep` (Tier 2), or plain projects (Tier 3) and routes to `azd up`, `azd init`, or traditional zip-deploy accordingly.

### Skill Files
Markdown files in `resources/skills/` define best-practice rules (e.g. `AF001`, `AF050`) that the validator sends to the LLM. Adding new rules requires only editing the Markdown — no code changes needed.
