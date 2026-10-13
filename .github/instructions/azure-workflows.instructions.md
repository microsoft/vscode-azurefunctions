---
applyTo: "src/commands/createFunctionApp/**,src/commands/deploy/**,src/commands/appSettings/**,src/commands/addBinding/**,src/commands/addMIConnections/**,src/commands/identity/**,src/commands/executeFunction/**,src/commands/logstream/**,src/commands/remoteDebug/**,src/commands/remoteDebugJava/**,src/commands/durableTaskScheduler/**,src/tree/durableTaskScheduler/**,src/tree/containerizedFunctionApp/**,test/nightly/**"
---

# Azure workflow instructions

## Create a Function App

Commands: `azureFunctions.createFunctionApp`, `azureFunctions.createFunctionAppAdvanced`; deployment may enter this flow.

- `src/commands/createFunctionApp/createFunctionApp.ts`: subscription/workspace resolution, delegation to `SubscriptionTreeItem.createChild`.
- `src/tree/SubscriptionTreeItem.ts`: wizard execution, provider-registration wait, node creation, Azure Resources refresh.
- `createCreateFunctionAppComponents.ts`: central prompt/execute composition.
  - Azure Tools steps: resource group, location, storage, App Insights, plan, role assignment, site name.
  - Functions steps: `FunctionAppHostingPlanStep.ts`, `stacks/**`, `flex/**`, `AuthenticationPromptStep.ts`, `UniqueNamePromptStep.ts`.
  - `FunctionAppCreateStep.ts`: ARM `Site`, app settings, runtime, managed-identity storage, Flex config, App Service call.
- Dockerfile flow:
  - `containerImage/detectDockerfile.ts`: detection.
  - `DeployWorkspaceProjectStep.ts`: Container Apps image/registry/environment delegation.
  - `ContainerizedFunctionAppCreateStep.ts`: site creation, one post-create host-status ping.
  - `src/tree/containerizedFunctionApp/**`: resulting resource/tree model.

New hosting/runtime options require component composition, context types, stack/plan filters, site creation, deployment validation, tests.

## Deploy

Commands: `azureFunctions.deploy`, `deployProject`, `deploySlot`, `deployByFunctionAppId`.

- `src/commands/deploy/deploy.ts`: path/project resolution, target selection/creation, site/subscription context, language/plan/SCM/build/Flex/Durable/MCP detection, validation, deployment, notification, refresh, trigger discovery.
- `getOrCreateFunctionApp.ts`, `FunctionAppListStep.ts`: target selection, embedded Function App creation.
- `runPreDeployTask.ts`: configured build/package task, native Python dependency fallback.
- `verifyAppSettings.ts`: runtime/version, build/package, feature flags, Durable/storage settings, propagation wait.
- `getWarningsForConnectionSettings.ts`, `getWarningForExtensionBundle.ts`, `validateRemoteBuild.ts`: focused compatibility warnings.
- Shared `@microsoft/vscode-azext-azureappservice` deploy is default; `DeployFunctionCoreToolsStep.ts` is custom-runtime/Flex exception.
- `notifyDeployComplete.ts`: completion actions, HTTP-trigger discovery.
- `CreateRemoteMcpServerExecuteStep.ts`: remote MCP registration.

Evaluate shared App Service deploy behavior before adding another path.

## Settings, connections, bindings, identities

- `appSettings/downloadAppSettings.ts`, `uploadAppSettings.ts`: Azure/local synchronization, encryption preservation, emulator-value exclusion.
- `appSettings/localSettings/**`, `src/funcConfig/local.settings.ts`: file selection, encryption, parsing, runtime/connection behavior.
- `appSettings/connectionSettings/**` modes:
  - `azureWebJobsStorage/**`: Azure or emulator.
  - `durableTaskScheduler/**`: Azure, custom, emulator.
  - `netherite/**`: Azure or emulator.
  - `sqlDatabase/**`: Azure or custom.
- Each backend owns only its implemented selection, resource/secret retrieval, emulator/custom prompts, final setting steps.
- `addBinding/**`: `function.json` binding wizard; direction/list/settings prompts, `BindingCreateStep`.
- `addMIConnections/**`: connection-string to identity-based local/remote settings; remote flow includes identity, role assignment.
- `identity/**`: direct system/user-assigned identity commands, refresh.

Never expose setting/connection values.

## Execute, logs, remote debug

- `executeFunction/executeFunction.ts`: local/remote HTTP, timer, non-HTTP execution; remote host keys only when needed; mask user-code response failures.
- `executeFunction/eventGrid/**`: Event Grid payload, CodeLens, mock files, send flow.
- `logstream/startStreamingLogs.ts`: App Service stream on Windows; Application Insights Live Metrics on Linux.
- `remoteDebug/startRemoteDebug.ts`: standard App Service remote debug after site/language resolution.
- `remoteDebugJava/**`: optional Java debug proxy.

Keep local debugger changes out of remote debug; remote log changes out of local Function Host debug view.

## Durable Task Scheduler

- `commands/durableTaskScheduler/**`: scheduler/task-hub create/delete, connection/endpoint copy, dashboard, emulator lifecycle.
- `createScheduler.ts`: subscription, registration, location, group, SKU, ARM operation, activity, cancellation, branch refresh.
- `tree/durableTaskScheduler/DurableTaskSchedulerClient.ts`: service calls.
- `DurableTaskSchedulerDataBranchProvider.ts`, resource models: Azure branches.
- `DurableTaskSchedulerWorkspaceResourceProvider.ts`, emulator clients/models, workspace branch provider: local Docker emulator.
- Project/settings integration: `createFunction/durableSteps/**`, `appSettings/connectionSettings/durableTaskScheduler/**`.

Keep Azure scheduler resources separate from emulator lifecycle; preserve their connection-setting contract.
