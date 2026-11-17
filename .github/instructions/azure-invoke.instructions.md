---
applyTo: "src/azureInvoke/**,src/tree/azureInvoke/**,src/commands/azureInvoke/**,src/webviews/azureInvoke/**,src/chat/tools/azureInvoke/**,resources/agents/azure-invoke.agent.md,test/azureInvoke/**"
---

# Azure Invoke instructions

Azure Invoke is the **Invoke** view: users and AI build HTTP requests for their Functions endpoints, save them as a session collection, chain them, and send them to the local host.

## Components

Each piece owns one thing. Keep new behavior with its owner instead of routing it through the tree.

- **Collection**: `src/azureInvoke/InvocationCollection.ts`. Saved definitions for this VS Code session: name, URL, method, headers, query, body, group, and dependency links. Validates every save as a whole (unique IDs, no cycles, no missing prerequisites) and always returns copies. Knows nothing about HTTP, tabs, or run results. Fires `onDidChange`.
- **Chain runner**: `src/azureInvoke/ChainInvocationRunner.ts`. Sends a saved invocation, optionally with its prerequisite chain, and records each invocation's latest run status. Owns prerequisite outputs (reused only while their definitions and inputs are unchanged), run reservations (so overlapping runs cannot repeat side effects), and statuses. Reads the collection; never edits it. Fires `onDidChangeStatus`.
- **Invocation runner**: `src/azureInvoke/InvocationRunner.ts`. One invocation's single in-flight request: send, cancel, and the latest started/result messages. The chain runner keeps one per invocation and shares it with that invocation's editor, so a run started by an MCP tool shows live in an open tab and Cancel in the tab stops it.
- **Editor manager**: `src/webviews/azureInvoke/extension/InvocationEditorManager.ts`. The open editor tabs, at most one per invocation. Wires each tab's Save to the collection and Send to the chain runner, and refreshes dependency pickers when the collection changes.
- **Editor**: `src/webviews/azureInvoke/extension/InvocationEditor.ts`. One webview tab. Handles `ready`, `sendRequest`, `abortRequest`, `saveRequest`, `renameRequest` messages. Receives save/send as callbacks; does not import the collection or runners.
- **Tree**: `src/tree/azureInvoke/`. `AzureInvokeTreeDataProvider` only builds root items and refreshes on collection or status changes. `InvocationItem` and `InvocationGroupItem` render themselves.
- **Commands**: `src/commands/azureInvoke/`. `(context, node?)` functions using `ext.invocationCollection`, `ext.chainInvocationRunner`, `ext.invocationEditorManager` (set in `src/extension.ts`). `openCollection.ts` and `saveCollection.ts` also own their file dialogs and confirmations.
- **MCP tools**: `src/chat/tools/azureInvoke/`. `create_http_invocation`, `list_http_invocations`, `run_http_invocation`, registered by `registerAzureInvokeTools`. Tools take the collection and chain runner as parameters and never open tabs.
- **Agent**: `resources/agents/azure-invoke.agent.md`, contributed through `chatAgents`. Its MCP tool list must match the registered tools.
- **Shared model**: `src/azureInvoke/httpInvocation.ts` (validate, copy, plan chain), `collectionFile.ts` (file format), `requestBindings.ts` (`{{name}}` templates and response selectors), `sendHttpRequest.ts` (transport, loopback checks). `src/webviews/azureInvoke/shared/httpRequest.ts` holds types shared with the webview bundle.

## Flow

Send from a tab: editor -> chain runner `send` -> collection for saved prerequisites -> bindings resolved from earlier outputs -> invocation runner sends -> messages stream to the tab -> status recorded -> tree refreshes.

Opening a collection file: confirm, close all editors, clear the chain runner, replace the collection. Run status must not carry over between collections.

## Rules

- Never put request data (URLs, headers, bodies, keys) in command arguments, tree item IDs, telemetry, or tool results beyond what the tool contract allows. Tree commands pass `InvocationItem`, which holds only ID, name, and status.
- Rely on Azure Tools' built-in telemetry masking; do not set `maskEntireErrorMessage`. Throw fixed, localized messages, replace transport or third-party errors where they are thrown (see `getRequestError` in `sendHttpRequest.ts`), and add any user value that can reach an error to `context.valuesToMask`.
- Only loopback targets (`localhost`, `127.x.x.x`, `[::1]`) can be sent. Reject the whole chain before any prerequisite runs. Full response bodies go to AI only for loopback chains.
- Validate before storing or sending; return copies, never stored objects.
- Status belongs to the chain runner, definitions to the collection. Do not cache either in the tree or editors.
- Collection files are plain text and may contain credentials; keep the save confirmation.
- The webview bundle (`src/webviews/azureInvoke/views`) is browser code built by `esbuild.mjs` and type-checked by its own `tsconfig.json`. Import only from `../shared`.
- Only HTTP triggers are supported. Other triggers stay listed as "Not yet supported" in Create Invocation until they ship.

## Tests

`test/azureInvoke/*.test.ts`, one suite per area, with fixtures in `azureInvokeTestUtils.ts`:

- `createInvoke()` / `createInvokeWithEditors()` build isolated instances; dispose them in `finally`.
- `useInvokeTestServer()` runs a local HTTP server for the suite; `invokeServer` exposes its URL and request counters.
- `runEditorScript` drives a real webview; `bundledExtension.test.ts` covers commands and the bundled MCP server through the test API.

Run `npm run build:esbuild`, then `npx vscode-test --grep "Azure Invoke"`.
