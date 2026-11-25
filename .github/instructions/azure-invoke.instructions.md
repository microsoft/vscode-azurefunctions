---
applyTo: "src/azureInvoke/**,src/tree/azureInvoke/**,src/commands/azureInvoke/**,src/webviews/azureInvoke/**,src/chat/tools/azureInvoke/**,resources/agents/azure-invoke.agent.md,test/azureInvoke/**"
---

# Azure Invoke instructions

Azure Invoke is an agent-first framework for testing REST APIs and Azure Functions triggers in VS Code. It currently supports local HTTP requests. Ask the Azure Invoke agent to turn an API workflow into a reusable collection of requests, run them, and inspect the results. You can also build, run, and inspect the same requests entirely by hand in the **Invoke** view, without using AI.

Run a single request or chain several together by passing values from earlier responses into later requests. For example, create an account, sign in, and use the returned token to call a protected endpoint. Export the collection to rerun the workflow later.

## Organizing principles

- Keep saved shapes and type guards in `src/azureInvoke/models/` so the extension and browser bundle can share them. Put trigger-specific execution under `src/azureInvoke/triggers/<kind>/`. For example, HTTP URL substitution and transport belong in `triggers/http/`, not in the model or the editor.
- Keep saved definitions in the collection and prerequisite ordering, output reuse, and run status in the chain runner. Commands, editors, and MCP tools call into that shared logic so they do not have to implement it separately. The tree only displays state.
- Keep commands, webviews, the tree, and MCP tools in their existing extension folders. Share tab management across triggers. Add a trigger-specific view when its fields or interactions differ.
- HTTP is the only supported trigger today, and the runner still takes HTTP types. Use the first non-HTTP trigger to work out where shared orchestration ends and trigger-specific work begins. Start with explicit dispatch by trigger kind rather than a registry. Do not add placeholder models or folders. Read [Adding a trigger](#adding-a-trigger) before starting one.

## Components

- **Collection**: `src/azureInvoke/InvocationCollection.ts`. Saved definitions for this VS Code session: name, URL, method, headers, query, body, group, and dependency links. Validates every save as a whole (unique IDs, no cycles, no missing prerequisites) and always returns copies. Knows nothing about HTTP, tabs, or run results. Fires `onDidChange`.
- **Chain runner**: `src/azureInvoke/invocationRunner/ChainInvocationRunner.ts`. Sends a saved invocation, optionally with its prerequisite chain, and records each invocation's latest run status. Owns prerequisite outputs (reused only while their definitions and inputs are unchanged), run reservations (so overlapping runs cannot repeat side effects), and statuses. Reads the collection; never edits it. Fires `onDidChangeStatus`. `RunState.ts`, in the same folder, holds that state for the open collection; clearing the runner swaps in a fresh instance, so a run that finishes late writes only to the discarded one. `InvocationRunStatus.ts` defines the status model that the tree and MCP tools read, and `InvocationRunOptions.ts` defines the options for `sendRequest`.
- **Invocation runner**: `src/azureInvoke/invocationRunner/InvocationRunner.ts`. One invocation's single in-flight request: send, cancel, and the latest started/result messages. The chain runner keeps one per invocation and shares it with that invocation's editor, so a run started by an MCP tool shows live in an open tab and Cancel in the tab stops it.
- **Editor manager**: `src/webviews/azureInvoke/extension/InvocationEditorManager.ts`. The open editor tabs, at most one per invocation. Wires each tab's Save to the collection and Send to the chain runner, and refreshes dependency pickers when the collection changes.
- **Editor**: `src/webviews/azureInvoke/extension/InvocationEditor.ts`. One webview tab. Handles `ready`, `sendRequest`, `abortRequest`, `saveRequest`, `renameRequest` messages. Receives save/send as callbacks; does not import the collection or runners.
- **Tree**: `src/tree/azureInvoke/`. `AzureInvokeTreeDataProvider` only builds root items and refreshes on collection or status changes. `InvocationItem` and `InvocationGroupItem` render themselves.
- **Commands**: `src/commands/azureInvoke/`. `(context, node?)` functions using `ext.invocationCollection`, `ext.chainInvocationRunner`, `ext.invocationEditorManager` (set in `src/extension.ts`). `openCollection.ts` and `saveCollection.ts` also own their file dialogs and confirmations.
- **MCP tools**: `src/chat/tools/azureInvoke/`. `create_http_invocation`, `list_http_invocations`, `run_http_invocation`, registered by `registerAzureInvokeTools`. Tools take the collection and chain runner as parameters and never open tabs.
- **Agent**: `resources/agents/azure-invoke.agent.md`, contributed through `chatAgents`. Its MCP tool list must match the registered tools.
- **Shared models**: `src/azureInvoke/models/` holds the saved schema and other models shared with the webview bundle. `collectionSchema.ts` and `httpSchema.ts` export the current collection and HTTP invocation schemas, limits, and types, which they take from versioned files such as `httpSchemaV1.ts`. `httpRunModel.ts` defines HTTP run results and messages, which are never saved. See [Collection file versioning](#collection-file-versioning). `src/webviews/azureInvoke/shared/invocationEditorProtocol.ts` holds the editor's webview messages, configuration, and labels.
- **Trigger execution**: `src/azureInvoke/triggers/http/` contains HTTP-specific execution code. `validateRequestTemplate.ts` checks templates before prerequisites run; `resolveRequestBindings.ts` fills in values at send time. They share placeholder, URL authority, and JSON body rules in `requestTemplateRules.ts`. Preflight and transport use `prepareHttpRequest.ts` to validate the request and assemble its URL and headers. `sendHttpRequest.ts` enforces loopback at send time and handles transport errors. The MCP tool filters its result in `src/chat/tools/azureInvoke/buildHttpInvocationToolResult.ts`. Add sibling folders as new triggers ship.
- **Collection helpers**: `httpInvocation.ts` validates and copies invocations and plans chains. `planInvocationChain` lists each prerequisite once, before the requests that need it, and always puts the target last; the chain runner relies on that order. `collectionFile.ts` reads and writes collection files using the schemas in `models/`.

## Flow

Send from a tab: editor -> chain runner `sendRequest` -> collection for saved prerequisites -> bindings resolved from earlier outputs -> invocation runner sends -> messages stream to the tab -> status recorded -> tree refreshes.

Opening a collection file: confirm, close all editors, clear the chain runner, replace the collection. Run status must not carry over between collections.

## Request bindings

A binding has a variable `name`, a source invocation ID `sourceId`, and a selector `pointer`. It supplies a value for `{{name}}` from the source invocation's result.

Each binding makes its `sourceId` a prerequisite because the request needs that result. There's no need to list the same ID in `dependsOn`. Use `dependsOn` when a request needs to wait for another invocation without reading its output. `getRequestDependencies` combines both sources into one list of unique prerequisite IDs for the chain planner.

Binding names are case-sensitive and use 1 to 64 ASCII letters, digits, underscores, or hyphens. A digit can come first, but a hyphen cannot. For example, `{{2fa-code}}` is valid. These names are local aliases, so they do not have to match the field names in the API response. `guid` is reserved.

The chain runner calls `validateRequestTemplate` for every request it will send before any of them run. Preflight checks for a fixed HTTP(S) authority, known variable names, valid field names, and valid JSON when a JSON body uses placeholders. It prepares the request with stand-in values, so it cannot catch a missing field or an unusable value in a real result. The runner also checks that the targets are loopback, and the HTTP transport enforces that independently.

At send time, `resolveRequestBindings` reads the prerequisite results the chain runner supplies:

| Selector | Reads |
| --- | --- |
| `/body` or `/body/...` | The JSON response body or a field within it |
| `/request/body` or `/request/body/...` | The JSON request body that was sent, after substitution |
| `/headers/<name>` | A response header by its lowercase name |
| `/status` | The numeric HTTP response status |

Response selectors start at the top level. Use `/body/id` for a response field, not `/response/body/id`. There is no `/response` prefix.

Selectors can walk object properties and array indexes, such as `/body/items/0/id`. Use `~1` for `/` and `~0` for `~` in key names. A selector fails if a field is missing or the body it reads is not valid JSON. The resolver parses each source body only when a selector needs it and reuses the parsed value within that request.

- URL variables are percent-encoded. They cannot change the destination, and `.` and `..` are rejected as substitution values in the URL.
- Text bodies and enabled query and header values accept strings, numbers, and booleans. Placeholders go in values, not field names. Disabled entries are left alone.
- Invoke does not send bodies with GET or HEAD. The editor disables the body field without clearing its contents. A send with a nonempty body fails preflight before any prerequisite runs.
- Quote placeholders in JSON. A placeholder that fills an entire JSON string keeps the selected value's type, including objects, arrays, and `null`. A placeholder embedded in a longer string stays text and must select a string, number, or boolean.
- `{{guid}}` generates one UUID per resolved request, shared by every use in that request. For example, a create request can send `{"clientId":"{{guid}}"}` and get back `204 No Content`. A follow-up lookup can bind to `/request/body/clientId` on the create invocation to reuse the UUID it sent. A new `{{guid}}` in the follow-up would generate a different UUID.

For example, if `get-account` returns `{"active":false}`, a dependent request can bind `{"name":"active","sourceId":"get-account","pointer":"/body/active"}`. Its body template `{"active":"{{active}}","label":"active={{active}}"}` resolves to `{"active":false,"label":"active=false"}`.

**Send** reuses current successful prerequisite outputs. **Run chain** reruns the prerequisites. The chain runner owns freshness checks and blocks a dependent request if a prerequisite has no current successful result. The resolver returns a new request and never writes substituted values back into the saved template.

`run_http_invocation` runs the whole chain by default. With `runDependencies: false`, it sends only the target and reports the IDs of any direct prerequisites whose earlier results it reused in `reusedPrerequisiteIds`. Reuse does not verify those prerequisites against the running app.

## Rules

- Never put request data (URLs, headers, bodies, keys) in command arguments, tree item IDs, telemetry, or tool results beyond what the tool contract allows. Tree commands pass `InvocationItem`, which holds only ID, name, and status.
- Rely on Azure Tools' built-in telemetry masking; do not set `maskEntireErrorMessage`. Throw fixed, localized messages, replace transport or third-party errors where they are thrown (see `getRequestError` in `sendHttpRequest.ts`), and add any user value that can reach an error to `context.valuesToMask`.
- Only loopback targets (`localhost`, `127.x.x.x`, `[::1]`) can be sent. Reject the whole chain before any prerequisite runs. Full response bodies go to AI only for loopback chains.
- Validate before storing or sending; return copies, never stored objects.
- Status belongs to the chain runner, definitions to the collection. Do not cache either in the tree or editors.
- Use the native Save As dialog to name the file; there is no separate title in the collection format. Export warns about likely literal credentials in recognized headers, query parameters, URL credentials, and named JSON or form fields, including disabled rows. Users can cancel or select **Save Anyway** to write the file unchanged. If nothing is flagged, skip the credential warning and keep normal overwrite protection. The check cannot detect arbitrary secrets. Credential bindings are saved unresolved. Session saves and sends are unchanged.
- The webview bundle (`src/webviews/azureInvoke/views`) is browser code built by `esbuild.mjs`. For shared Azure Invoke code, import only from `../shared` or `src/azureInvoke/models/`. The webview's `tsconfig.json` checks every model, even if the webview does not import it. Keep models browser-safe: no Node or vscode imports and no imports from outside `models/`.
- `src/azureInvoke` never imports from `tree`, `commands`, `webviews`, or `chat`.
- **Create Invocation...** opens the manual editor directly while only one trigger type is supported. Ask for a trigger type only when the choice changes which editor opens.
- **Build Invocations with Copilot...** is a separate action in the empty Invoke view, view menu, and Command Palette. It opens the Azure Invoke agent to add invocations for supported triggers without replacing the collection, running invocations, or editing project files. Keep its label and prompt independent of trigger type.
- The agent groups new invocations by feature or workflow using the saved `group` field. Reuse existing group labels when they fit. The tree shows ungrouped invocations above folders without changing collection order. Bindings and `dependsOn` still control execution order.

## Collection file versioning

### Where the schema lives

The saved format is defined once, in `src/azureInvoke/models/`. Import from there instead of restating a field or a limit anywhere else. Each schema has two kinds of file:

- **Versioned files**, such as `collectionSchemaV1.ts` and `httpSchemaV1.ts`, hold one version's schema and the limits and rules that schema enforces. A versioned file is frozen once the next version exists.
- **Current files**, `collectionSchema.ts` and `httpSchema.ts`, point at the newest versioned file. They export the current schemas, limits, types, guards, and helpers, plus the version history and `currentCollectionVersion`.

Code outside `models/` imports only from the current files. The one exception is `collectionFile.ts`, which reads every version it supports, so it imports each versioned schema it accepts.

- `collectionSchema.ts`: the file's outer `{ version, invocations }` object and the fields every invocation shares (`id`, `name`, `group`).
- `httpSchema.ts`: the HTTP invocation and request, and named limits such as `maxRequestBodyBytes`. `HttpInvocation`, `HttpRequest`, and the other saved types are inferred from it. `isHttpInvocation` and `isHttpRequest` check against it, and the MCP tool input schemas in `src/chat/tools/azureInvoke/invocationSchemas.ts` are built from its parts.

### How versions are managed

- **Read every version, write only the current one.** Loading accepts every version this build knows and upgrades an older file step by step to the current shape. Saving always writes `currentCollectionVersion`. Code outside `models/` and `collectionFile.ts` only ever sees the current shape.
- **Old schemas are frozen.** Each version lives in its own file, such as `httpSchemaV1.ts`. When a new version is added, it gets a new file, and the old file never changes again. An upgrade function turns the old shape into the new one, and the current file points at the newest version.
- **Bump the version that owns the changed fields**, even for optional additions. Without an HTTP schema version bump, for example, an older build could silently drop a new `expect` field when saving a collection.
- **Reject the whole file** if its file version, any trigger, or any trigger schema version is unsupported. Never load part of it.

### Changing the schema

1. Add a versioned schema file, such as `httpSchemaV2.ts`, and leave the old schema unchanged.
2. Point the corresponding current module at the new schema and update its version history. An HTTP-only change bumps `currentHttpSchemaVersion`, not `currentCollectionVersion`.
3. In `collectionFile.ts`, validate older entries against their original schemas and upgrade them before returning them to callers.
4. Add a fixture for the new format. Fixture names start with the collection version and can include a suffix for trigger versions, such as `v1-http-v2.json`. Update the expected fixtures to match what the current build writes.
5. Run the "every saved collection format version still loads" test in `invocationCollection.test.ts`.

Once a format ships, never edit or delete its input fixture. Unreleased format changes can update the existing fixture without a version bump.

### File and trigger versions

The top-level `version` covers the collection envelope and shared invocation fields. Each saved invocation requires a `trigger` and `schemaVersion` that select its trigger-specific schema. A collection with `"version": 1` currently contains entries with `"trigger": "http"` and `"schemaVersion": 1`. HTTP bindings are part of the HTTP schema.

The tags stay in the file format; the editor and runner use the in-memory HTTP invocation shape.

## Adding a trigger

HTTP is the only trigger today, so the collection, planner, and runners call HTTP code directly. This section records the intended design for the next trigger. It is a starting point, not a decision. The first non-HTTP trigger must test it against real requirements, change it where it doesn't fit, and update this section with what was built.

### Intended shape

Each trigger kind gets one class in `src/azureInvoke/triggers/<kind>/`, such as `HttpTrigger` and `TimerTrigger`, implementing a shared `InvocationTrigger` interface. The class owns the trigger's rules. The collection, collection file, chain planner, and both runners call the interface instead of importing HTTP functions. An exhaustive `switch` on `invocation.trigger` picks the class, so a new kind that isn't handled fails to compile. Do not use a registry.

The class takes over these HTTP-specific steps:

| Concern | HTTP code today | Used by |
| --- | --- | --- |
| Shape check | `httpSchema.ts`, through `isHttpInvocation` and `validateInvocation` | Collection, collection file, editor, MCP tool input |
| Detached copy | `copyInvocation` | Collection, collection file, runner freshness checks |
| Dependencies | `getRequestDependencies` | Planner, chain runner |
| Checks before any request runs | `validateRequestTemplate` | Chain runner |
| Allowed target | `assertLocalHttpRequest`, `isLocalHttpRequest` | Chain runner, Copilot sharing |
| Fill values from prerequisites | `resolveRequestBindings` | Chain runner |
| Execute | `sendHttpRequest` | Invocation runner |
| Success | `isSuccessStatus` | Both runners |
| Status summary | `statusCode` and `duration` on `InvocationRunStatus` | Tree, `list_http_invocations` |

Keep the required part of the interface small: copy, dependencies, execute, and success. Make templates and bindings an optional capability that only triggers with templates provide, rather than methods that other triggers implement as no-ops.

### Constraints

- Models and guards stay in `models/` and stay browser-safe. The trigger class runs requests, so it lives in `triggers/<kind>/`, and the webview bundle never imports it.
- Editors stay on the webview side. The trigger class is core logic only, and `src/azureInvoke` still never imports `webviews`.
- Invocations need a `trigger` field and their own schema version. See [Collection file versioning](#collection-file-versioning).
- Run messages and statuses are HTTP-shaped (`HttpRequestStateMessage`, `statusCode`, `duration`). They need a shared envelope that carries a trigger-specific result or summary.
- Bindings read HTTP results (`/body`, `/headers`, `/status`). Decide whether a binding can read another trigger's output, which needs a shared output shape or per-trigger selectors, or whether bindings stay within one trigger kind. This is the largest open question.

### Required before a new trigger ships

- Reconsider every row of the table and every constraint against both triggers. Where the new trigger doesn't fit, change the design instead of forcing the trigger into HTTP's shape.
- Move HTTP behind the same interface in the same change. There should be one path for all triggers, not an HTTP path plus a generic one.
- Keep every existing Azure Invoke test passing without weakening it.
- Add tests for the new trigger that cover:
  - Saving and validation in the collection.
  - Loading collection files and rejecting entries with missing tags, unknown trigger kinds, or unsupported schema versions.
  - A run with prerequisites.
  - Blocked and cancelled runs.
  - Clearing the runner while a run is in flight.
  - Status in the tree and in the MCP list tool.
  - Any mixed-trigger chain the design allows.
- Run the new trigger end to end in VS Code: create, save, run, cancel, and reopen a collection.
- Update this section, the Components list, and the "Only HTTP triggers are supported" rule to match what was built.

## Tests

Use the [Azure Invoke test overview](../../test/azureInvoke/README.md) to find the right suite. Update its links and summaries in the same change when adding, removing, or renaming a test file or changing what a suite covers. Keep it at suite level and omit test counts.

Group related cases and give assertion regexes descriptive names. Keep suite-specific expectations local and share cross-suite expectations in `test/azureInvoke/invokeTestExpectations.ts`. Keep expected values independent of production validators so tests can catch changes to the contract.

`test/azureInvoke/*.test.ts`, one suite per area, with fixtures in `azureInvokeTestUtils.ts`:

- `createInvoke()` / `createInvokeWithEditors()` build isolated instances; dispose them in `finally`.
- `useInvokeTestServer()` runs a local HTTP server for the suite; `invokeServer` exposes its URL and request counters.
- `runEditorScript` drives a real webview; `bundledExtension.test.ts` covers commands and the bundled MCP server through the test API.

Run `npm run build:esbuild`, then `npx vscode-test --grep "Azure Invoke"`.
