# Function Core Tools Deployment Example

## Overview

The `deployFunctionCoreTools.ts` file provides a complete Azure Wizard implementation that allows users to deploy Azure Functions using either:

1. **Function Core Tools (`func publish`)** - If available or after installation
2. **Zip deployment** - Fallback method or user choice

## Key Features

### 1. Automatic Detection
```typescript
const funcToolsInstalled = await validateFuncCoreToolsInstalled(context, '', context.workspaceFolder.uri.fsPath);
```

### 2. User Choice Dialog
- If tools exist: Choose between `func publish` vs zip deploy
- If tools missing: Install tools vs use zip deploy

### 3. Wizard Pattern Implementation
```typescript
const wizard = new AzureWizard(context, {
    title: localize('deployToFunctionApp', 'Deploy to Function App'),
    promptSteps: [new FuncCoreToolsDeployMethodStep()],
    executeSteps: [
        new InstallFuncCoreToolsStep(),
        new DeployFunctionCoreToolsStep()
    ],
    showLoadingPrompt: true
});
```

## Usage Example

```typescript
import { deployWithFunctionCoreTools } from './commands/deploy/deployFunctionCoreTools';

// From a command
await deployWithFunctionCoreTools(context, target);
```

## Wizard Steps

### 1. FuncCoreToolsDeployMethodStep (Prompt)
- Checks if function core tools are installed
- Presents appropriate options based on availability
- Sets context properties: `useFuncPublish`, `installCoreTools`

### 2. InstallFuncCoreToolsStep (Execute)
- Only runs if `installCoreTools` is true
- Currently shows manual installation instructions
- Can be extended to use actual installation APIs

### 3. DeployFunctionCoreToolsStep (Execute)
- Only runs if `useFuncPublish` is true
- Validates tools are available
- Runs pre-deploy tasks
- Creates terminal and executes `func azure functionapp publish`

## Error Handling

- Validates project structure (host.json)
- Checks function core tools availability
- Provides fallback to zip deployment
- Shows appropriate error messages with actionable guidance

## Telemetry

Tracks:
- `useFuncPublish`: Whether user chose func publish
- `installCoreTools`: Whether user chose to install tools
- Standard deployment telemetry

## Integration Points

- Uses existing `validateFuncCoreToolsInstalled` API
- Integrates with `runPreDeployTask` for build steps
- Uses `notifyDeployComplete` for completion handling
- Follows extension's localization patterns
- Uses existing Azure Wizard infrastructure

## Future Enhancements

1. **Actual Installation**: Replace manual instructions with programmatic installation
2. **Progress Tracking**: Add real-time progress for func publish commands
3. **Error Recovery**: Better handling of func publish failures
4. **Configuration**: Allow customization of func publish arguments
5. **Validation**: Pre-flight checks for Azure authentication
