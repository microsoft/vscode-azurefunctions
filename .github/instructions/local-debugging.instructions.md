---
applyTo: "src/debug/**,src/funcCoreTools/**,src/commands/pickFuncProcess.ts,src/commands/initProjectForVSCode/InitVSCodeStep/**,src/vsCodeConfig/tasks.ts,src/vsCodeConfig/launch.ts,src/vsCodeConfig/settings.ts,test/goDebugProvider.test.ts,test/funcHostErrorContext.test.ts,test/resolveFuncCoreToolsPath.test.ts,test/hasMinFuncCliVersion.test.ts,test/isCodeSignatureExpected.test.ts"
---

# Local debugging instructions

Local debugging shares host/task plumbing but splits by attach mechanism:

1. Language `InitVSCodeStep` writes attach configuration, `func: host start` pre-launch task.
2. `src/debug/validatePreDebug.ts` holds common Core Tools, project, runtime/model, worker-setting, Durable, storage/Azurite, continue/cancel checks.
3. Node, Python, Java, PowerShell, Ballerina, Go attach through `src/debug/FuncDebugProviderBase.ts`.
4. `src/debug/{Node,Python,Java,PowerShell,Ballerina}DebugProvider.ts` supplies worker debug argument, default port/pipe.
5. `src/debug/GoDebugProvider.ts` extends provider flow: Core Tools starts Go worker; provider finds it, manages external Delve attach/cleanup.
6. `src/debug/FuncTaskProvider.ts` provides/resolves `func` tasks, selects Core Tools, sets worker debug environment, activates Python venvs, applies problem matchers, forwards emulator storage settings.
7. `src/funcCoreTools/funcHostTask.ts` observes tasks/terminals, tracks running/stopped hosts, captures bounded logs/errors, records ports/PIDs, optionally stops hosts after debug.
8. .NET launch configs call `${command:azureFunctions.pickProcess}` directly; `src/commands/pickFuncProcess.ts` runs validation, starts/reuses host, selects attach child, including isolated PID discovery.
9. `src/debug/FunctionHostDebugView.ts`, `registerFunctionHostDebugView.ts` show running/stopped hosts/errors, logs, Ask Copilot.

Core Tools discovery, install/update, version, signature, package-manager behavior live in `src/funcCoreTools/**`; executable choice starts at `getFuncCliPath.ts`.

- Launch JSON: language `InitVSCodeStep`.
- Attach config/worker args: language debug provider.
- Task quoting/environment/problem matcher: `FuncTaskProvider`.
- F5 validation: `validatePreDebug`.
- Host lifetime/log/PID/port: `funcHostTask.ts` or `pickFuncProcess.ts`.
- Go attach lifecycle: `GoDebugProvider.ts`; never force into normal worker-argument behavior.

Preserve platform-specific process discovery, Python shell activation, custom ports/pipes, multi-root task scopes, root-vs-child debug-session cleanup.
