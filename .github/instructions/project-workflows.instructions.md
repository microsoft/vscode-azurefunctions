---
applyTo: "src/commands/createNewProject/**,src/commands/createFunction/**,src/commands/initProjectForVSCode/**,src/templates/**,src/vsCodeConfig/**,test/createFunction/**,test/project/**"
---

# Project and function workflow instructions

## Create a local project

Commands: `azureFunctions.createNewProject`, `azureFunctions.createNewProjectWithDockerfile`.

- `src/commands/createNewProject/createNewProject.ts`: orchestration, classic/gallery choice, defaults, activity context, local-resource refresh.
- `FolderListStep.ts`: target folder, already-open state.
- `NewProjectLanguageStep.ts`: supported project types, language subwizard.
  - `ProgrammingModelStep.ts` plus `src/constants.ts`: programming-model choices.
  - `ProjectCreateStep/*ProjectCreateStep.ts`: language-specific generation/CLI invocation.
  - Named Java, Python, Ballerina, Dockerfile, MCP directories: specialized prompts/setup.
- `ProjectCreateStep/ProjectCreateStepBase.ts`: destination creation, common telemetry, optional `git init`.
- `src/commands/createFunction/FunctionListStep.ts`: optional first function.
- `src/commands/initProjectForVSCode/InitVSCodeLanguageStep.ts`, `InitVSCodeStep/*`: generated tasks, launch config, settings, extensions.
- `OpenBehaviorStep.ts`, `OpenFolderStep.ts`: current/new window, workspace addition, no-open behavior.
- `FunctionsTemplateGalleryController.ts`: gallery-specific template fetching/copy, AI generation, project opening; shared panel plumbing belongs to `@microsoft/vscode-azext-webview`.

Change language branching in `NewProjectLanguageStep.ts`, generated project content in language `ProjectCreateStep`, `.vscode` output in language `InitVSCodeStep`, gallery-only behavior in `FunctionsTemplateGalleryController.ts`.

## Create a function

Command: `azureFunctions.createFunction`; reused by project creation and public API.

- `src/commands/createFunction/createFunction.ts`: workspace/project resolution, language/runtime initialization, project-creation redirect, wizard start.
- `FunctionListStep.ts`: template retrieval/selection, explicit template IDs, Durable filtering, subwizard injection.
- `src/templates/CentralTemplateProvider.ts`: provider selection, version-matched cache -> latest -> stale cache -> shipped backup fallback.
- `src/templates/{dotnet,java,script,ballerina}/**`: language retrieval, parsing, filtering, caching, backup behavior.
- Schema v1: `FunctionSubWizard.ts`, language prompt directories, shared binding prompts under `addBinding/settingSteps/**`, language `*FunctionCreateStep.ts`.
- Schema v2: `JobsListStep.ts`, `promptStepsV2/promptStepFactory.ts`, `actionStepsV2/actionStepFactory.ts`.
- `FunctionCreateStepBase.ts`: common telemetry, extension-bundle validation, `host.json`, MCP setup, generated-file opening, restart-safe post-create cache.
- `durableSteps/**`: Durable backend selection/configuration triggered by templates.

Missing/stale templates belong in provider/cache logic. Wrong prompts/files belong in schema-specific subwizard, create/action step; do not patch parsed template data in command orchestration.

## Initialize an existing project

Command: `azureFunctions.initProjectForVSCode`.

- `src/commands/initProjectForVSCode/initProjectForVSCode.ts`: project location, language/model/runtime detection, wizard.
- `detectProjectLanguage.ts`: language/model detection.
- `InitVSCodeLanguageStep.ts`: language selection, `addInitVSCodeSteps`.
- `InitVSCodeStep/InitVSCodeStepBase.ts`: common `.vscode/tasks.json`, `launch.json`, `settings.json`, `extensions.json`, subpaths, `.gitignore`.
- Language `InitVSCodeStep`s: tasks, attach config, pre-deploy task, deploy subpath, extension recommendations.
- `src/vsCodeConfig/{tasks,launch,settings,extensions}.ts`: configuration access/edit helpers.

F5 changes often require coordinated edits to language `InitVSCodeStep`, runtime debug provider, `FuncTaskProvider`.
