# DTS Emulator Provider — Changes Summary

## What changed

Moved DTS emulator start logic from the `DTSConnectionListStep` sub-wizard into the `LocalEmulatorsListStep` dependency injection pattern, matching the approach already used for Azure Storage (Azurite).

## New files

### `DTSEmulatorStartExecuteStep.ts`
Self-contained execute step for `IPreDebugValidateContext` that:
1. Starts the DTS emulator via `azureFunctions.durableTaskScheduler.startEmulator` command
2. Retrieves the emulator info to get the scheduler endpoint
3. Derives the connection string using `getSchedulerConnectionString(..., SchedulerAuthenticationType.None)`
4. Writes the connection string and hub name (`default`) to `local.settings.json` via `setLocalSetting`
5. Shows an info message with the scheduler and dashboard endpoints
6. Only executes when `context.startDTSEmulator` is `true` (set by the prompt step)

### `DTSEmulatorPromptStep.ts`
Prompt step that asks the user whether to start the DTS emulator when it's detected as not running. Sets `context.startDTSEmulator = true` if the user accepts.

### `dtsEmulatorProvider.ts` (updated)
Now provides both `providePromptSteps()` → `[DTSEmulatorPromptStep]` and `provideExecuteSteps()` → `[DTSEmulatorStartExecuteStep]`.

### `getEmulatorProviders.ts`
Factory function with switch on `context.durableStorageType`:
- Always includes the storage (Azurite) provider
- Adds the DTS provider when `durableStorageType === StorageProviderType.DTS`

## Modified files

### `IPreDebugValidateContext.ts`
Added `startDTSEmulator?: boolean` with JSDoc describing its purpose.

## Key differences from original `DTSEmulatorStartStep`

| Aspect | Original (`DTSEmulatorStartStep`) | New (`DTSEmulatorStartExecuteStep`) |
|--------|-----------------------------------|-------------------------------------|
| Context type | `IDTSConnectionWizardContext` | `IPreDebugValidateContext` |
| Sets `context.dtsEmulator` | Yes (for downstream steps) | No (self-contained) |
| Writes to local.settings.json | No (delegated to `DTSConnectionSetSettingStep`) | Yes (directly via `setLocalSetting`) |
| `shouldExecute` check | `!context.newDTSConnectionSettingValue && !context.dtsEmulator` | `!!context.startDTSEmulator` |

## Deleted files

- `commands/appSettings/connectionSettings/durableTaskScheduler/emulator/DTSEmulatorStartStep.ts` — emulator starting now handled by `DTSEmulatorStartExecuteStep` in the provider
- `commands/appSettings/connectionSettings/durableTaskScheduler/emulator/DTSEmulatorGetConnectionsStep.ts` — connection derivation now inlined in `DTSEmulatorStartExecuteStep`
- `commands/appSettings/connectionSettings/durableTaskScheduler/emulator/` — directory removed (empty)

## Additional modifications

### `DTSConnectionListStep.ts`
- Removed `ConnectionType.Emulator` case from `getSubWizard()` switch statement
- Removed emulator button from `prompt()` options
- Removed imports for `DTSEmulatorStartStep`, `DTSEmulatorGetConnectionsStep`, and `useEmulator`

### `setDTSConnectionPreDebug.ts`
- Changed `availableDebugConnectionTypes` from `[Emulator, Custom]` to `[Custom]` only — emulator starting is handled by the `LocalEmulatorsListStep` provider
