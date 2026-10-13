---
applyTo: "src/debug/**,src/funcCoreTools/**,src/commands/pickFuncProcess.ts,src/commands/initProjectForVSCode/InitVSCodeStep/**,src/vsCodeConfig/tasks.ts,src/vsCodeConfig/launch.ts,src/vsCodeConfig/settings.ts,test/goDebugProvider.test.ts,test/funcHostErrorContext.test.ts,test/resolveFuncCoreToolsPath.test.ts,test/hasMinFuncCliVersion.test.ts,test/isCodeSignatureExpected.test.ts"
---

# Local debugging instructions

Local debugging is one pipeline:

1. Language `InitVSCodeStep` writes attach configuration, `func: host start` pre-launch task.
2. `src/debug/FuncDebugProviderBase.ts` supplies default attach config, intercepts Functions-host debug startup.
3. `src/debug/validatePreDebug.ts` checks Core Tools, project discovery, runtime/model, worker setting, Durable connections, storage/Azurite, continue/cancel.
4. `src/debug/{Node,Python,Java,PowerShell,Ballerina}DebugProvider.ts` supplies worker debug argument, default port/pipe.
5. `src/debug/GoDebugProvider.ts` differs: Core Tools starts Go worker; provider finds it, manages external Delve attach/cleanup.
6. `src/debug/FuncTaskProvider.ts` provides/resolves `func` tasks, selects Core Tools, sets worker debug environment, activates Python venvs, applies problem matchers, forwards emulator storage settings.
7. `src/funcCoreTools/funcHostTask.ts` observes tasks/terminals, tracks running/stopped hosts, captures bounded logs/errors, records ports/PIDs, optionally stops hosts after debug.
8. `src/commands/pickFuncProcess.ts` starts/reuses host, selects attach child process, including .NET isolated PID discovery.
9. `src/debug/FunctionHostDebugView.ts`, `registerFunctionHostDebugView.ts` show running/stopped hosts/errors, logs, Ask Copilot.

Core Tools discovery, install/update, version, signature, package-manager behavior live in `src/funcCoreTools/**`; executable choice starts at `getFuncCliPath.ts`.

- Launch JSON: language `InitVSCodeStep`.
- Attach config/worker args: language debug provider.
- Task quoting/environment/problem matcher: `FuncTaskProvider`.
- F5 validation: `validatePreDebug`.
- Host lifetime/log/PID/port: `funcHostTask.ts` or `pickFuncProcess.ts`.
- Go attach lifecycle: `GoDebugProvider.ts`; never force into normal worker-argument behavior.

Preserve platform-specific process discovery, Python shell activation, custom ports/pipes, multi-root task scopes, root-vs-child debug-session cleanup.
