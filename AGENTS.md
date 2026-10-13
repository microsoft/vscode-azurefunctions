# Azure Functions extension agent guide

TypeScript VS Code extension creates, configures, debugs, deploys, manages local and Azure Function Apps. Use this map to find narrowest owner before editing; matching `.github/instructions/*.instructions.md` files hold deeper subsystem rules.

## Architecture

- `src/extension.ts`: activation, shared package initialization, command/provider registration, public API, test API.
- `src/extensionVariables.ts`: process-wide state initialized during activation. Prefer action/wizard context over new globals.
- `package.json`, `package.nls.json`: command/view/menu/settings contributions, localized contribution text.
- `src/commands/registerCommands.ts`: most `azureFunctions.*` dispatch.
- `src/commands/**`: command orchestration; multi-step flows use `AzureWizard`.
- `src/tree/**`, `src/FunctionAppResolver.ts`, `src/LocalResourceProvider.ts`: Azure Resources and workspace tree integration.
- `src/workspace/**`, `src/funcConfig/**`, `src/vsCodeConfig/**`: discovery, Functions/VS Code configuration.
- `src/funcCoreTools/**`, `src/templates/**`, `src/debug/**`: Core Tools, templates, local host, debugger behavior.
- `src/utils/azureClients.ts`: extension-specific Azure SDK factories.
- `src/vscode-azurefunctions.api.d.ts`: public contract. `src/testApi.ts`: test-only contract.
- `test/**`: VS Code extension tests; live/long-running tests use existing environment gates.

Trace behavior end-to-end before editing:

`package.json` contribution or API call -> registration -> command/wizard -> shared service/tree model -> refresh/output -> tests.

## Command wiring

- Change command title, visibility, menu, keybinding, setting, activation, or `when` clause in `package.json`, `package.nls.json`.
- Change command arguments/dispatch in `src/commands/registerCommands.ts`.
- Function Host debug-view commands registered in `src/debug/registerFunctionHostDebugView.ts`.
- Debug providers, task provider, resolvers, workspace providers, URI handling, APIs registered in `src/extension.ts`.
- `src/agent/agentIntegration.ts` advertises agent-invokable commands, adapts queued wizard input.
- `src/commands/api/**`: thin public API adapters; product behavior stays in normal command/service implementations.

## Direct command ownership

- App lifecycle: `src/commands/startFunctionApp.ts`, `stopFunctionApp.ts`, `restartFunctionApp.ts`.
- Function state/deletion: `updateDisabledState.ts`, `deleteFunction.ts`, `deleteFunctionApp.ts`, `deleteNode.ts`.
- Slots/children: `createSlot.ts`, `swapSlot.ts`, `createChildNode.ts`.
- Navigation/inspection: `browseWebsite.ts`, `openInPortal.ts`, `viewProperties.ts`, `openFile.ts`.
- URLs/keys: `copyFunctionUrl.ts`, `getMcpHostKey.ts`.
- Deployment source/history: `configureDeploymentSource.ts`, `src/commands/deployments/**`.
- Core Tools install/update/uninstall: `src/funcCoreTools/**`.

Convert direct commands to wizard steps when prompts or durable side effects multiply.

## Tests

- `test/createFunction/**`: templates across languages, runtimes, models, sources.
- `test/project/**`: project scaffolding, VS Code initialization.
- `test/nightly/**`: gated live-Azure operations.
- Top-level `test/*.test.ts`: focused utilities, Core Tools, debugging, settings, parsing, compatibility.
- `test/api.test.ts`, `test/utils/testApiAccess.ts`, `src/testApi.ts`: bundled extension boundary.
- `test/global.test.ts`, `test/addParallelSuite.ts`, `test/utils/**`: shared setup, gates, workspaces, contexts, parallel execution.

Place regression coverage beside nearest suite; do not create second harness for behavior already exposed through test API.
