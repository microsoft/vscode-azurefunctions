# Azure Invoke prototype handoff

This document captures the prototype as of October 16, 2026, including grouped tree status, response formatting, preview diagnosis, reviewed saved-request fixes, and breakpoint-driven replay. Check `git status` before continuing: the latest implementation changes are in the working tree and should not be assumed committed.

Azure Invoke is an HTTP request client inside the Azure Functions extension. It can target Functions or another HTTP API, including a local Go service. The prototype is not an assertion-based test runner. A successful HTTP status is an observation, not proof that an application's behavior is correct.

For user-facing instructions, start with [Azure Invoke in the README](README.md#azure-invoke). This handoff explains ownership, decisions, implementation details, and unfinished work.

## Pick back up

1. Open this branch in VS Code. For a fresh checkout without dependencies, run `npm ci`.
2. Run `npm run build`. The minimum supported VS Code version is 1.106.
3. Use the existing **Launch Extension** debug configuration. Its prelaunch task starts the ESBuild watcher. **Launch Extension + Host** also loads Azure Resource Groups from a sibling checkout; only use it when that checkout exists.
4. In the extension development window, open the API project being tested. Start its server yourself. Azure Invoke does not start hosts, deploy infrastructure, or seed a database.
5. Open **Azure Invoke** in the Azure sidebar. Try **Add Invocation Manually...** or **Author Collection with AI...**.
6. For guided authoring, enable GitHub Copilot Chat and **Azure Functions Extension Tools** in its tool configuration. The custom agent is named **Azure Invoke**.
7. Export a collection explicitly if its definitions need to survive closing or reloading VS Code. This Git branch preserves code, not an active review, saved session requests, or runtime results.

Browser-only previews of the webview bundle do not exercise extension state, tool authorization, or real collection execution. Use the Extension Development Host and native tests for those flows.

## What is built

| Area | Current behavior |
| --- | --- |
| View and manual entry | A dedicated Azure Invoke tree, add-trigger quick pick, manual HTTP editor, and AI authoring entry point. Other trigger types are listed but not executable. |
| HTTP editor | Method, absolute URL, query parameters, headers, body, editable name, explicit Save, Send, cancellation, and status/timing/headers/body display. |
| Response formatting | Shared display-only JSON formatting in saved editors and review previews. Raw response data remains unchanged. |
| Saved requests | Stable IDs and session-only snapshots. Reopen an entry to edit it or inspect its last full response. Unsaved editor changes are not the saved snapshot used by MCP. |
| Collection files | Explicit JSON import/export. Import replaces the current collection and closes request editors after confirmation. Export warns that definitions can contain plaintext credentials. |
| Dependencies | Searchable prerequisite/source pickers, order-only prerequisites, response and resolved-input selectors, and variable substitution. |
| Runtime generation | `{{guid}}` generates one UUID per request execution, shared across its occurrences within that request. |
| Guided AI authoring | Workspace discovery through a bundled custom agent, a grouped editable review, manual previews, iterative feedback, and direct saving on Confirm. |
| Preview diagnosis | Explicit per-request or collection-wide sharing of failed preview evidence for read-only source-based diagnosis. |
| Saved-request fixes | Last-run status discovery, approved evidence inspection, and field replacements reviewed before updating existing saved IDs. |
| Debug replay | The same agent chooses breakpoints through Microsoft DebugMCP and replays captured local inputs against an existing VS Code debug session. |
| MCP execution | Headless creation, review tools, saved-request discovery, and execution with prerequisite chains and restricted response sharing. |
| Progress | Loading and revision indicators, resource folders, last-run timestamps, status icons, and cached results without automatically opening many editors. Requests blocked by prerequisites show warning icons. |

Manual and AI-created requests use the same execution implementation. AI creation and execution stay headless. An editor opens when the user asks to inspect a request, not for every tool-created entry.

## Guided authoring and review

The flow is:

```text
Author Collection with AI
  -> loading review + Azure Invoke chat
  -> agent reads project source and proposes complete request templates
  -> grouped editable review
       -> Send / Run chain: real HTTP previews, no collection save
       -> failed previews: Diagnose with Copilot / Diagnose failed requests
            -> read-only explanation in chat, no request or application edits
       -> feedback present: Request changes
            -> agent reads submitted feedback
            -> complete revised proposal replaces the same review
            -> review again
       -> no feedback: Confirm
            -> selected definitions saved atomically in the tree
            -> later execution is a separate user request
```

HTTP rows start checked and collapsed. Related methods and collection/item routes share a resource heading. Expanded rows show authentication evidence, editable request fields, dependencies, a response preview, and feedback. Lock, open-lock, and question-mark indicators mean required, anonymous, and unknown authentication.

Nonempty feedback in any HTTP row, including an unchecked row, changes the action to **Request changes**. Whitespace alone does not. Submitting feedback saves nothing and starts a revision-specific chat turn containing the review identifier and revision number, not private request values.

The revision tool reads explicitly submitted comments and selected flags. A replacement proposal must target the active review and current requested revision. Existing case IDs preserve selection and local edits. Processed comments clear after a replacement is accepted. Stale proposals, closed reviews, and premature drafting are rejected. Chat failures leave notes editable and retryable, and the user can cancel while chat is pending.

Without feedback, **Confirm** saves the selected requests' current fields directly. It does not start another chat turn or send HTTP. The whole selected dependency graph must be valid and include its prerequisites. Saving is atomic and repeated confirmation does not create duplicates. Existing saved entries remain intact.

Proposal candidate IDs are translated together into new stable saved invocation IDs. Review groups are preserved as optional invocation groups and appear as collapsible folders in the saved tree. Ungrouped requests stay at the root. Authentication annotations, descriptions, and feedback belong only to the review.

### AI authoring defaults

The agent's instructions and tool descriptions establish these defaults:

- Propose one generic request per discovered HTTP method and route, not an invented matrix of negative tests and special cases.
- Keep names short, usually two to six words, with a maximum of 60 characters for AI-created names.
- Fill bodies with usable synthetic values based on models, validation, enums, and required nested objects. Adapt generated passwords to actual application constraints.
- For GETs, follow handlers into query models, validation, and parsing helpers. Include discovered filters, pagination, sorting, and search parameter names. Leave optional values empty and disabled unless requested.
- Inspect instance-route parameter names and constraints. Link IDs to a suitable create response when possible. Ask about required inputs that cannot be inferred safely.
- Author prerequisite links up front, including generated credentials reused by login and ordering that puts deletion after updates.
- Read relevant projects across the workspace, but do not read secret settings or guess credentials, existing IDs, routes, or response fields.

These are model instructions, not a deterministic route scanner or a guarantee that every language/framework will be discovered correctly. Review the proposal against the application.

Automatic draft execution and a run-and-correct authoring loop are **not implemented**. The agent proposes and stops; the user runs review previews manually. Explicit diagnosis and saved-request repair do not provide runtime feedback during initial authoring. Do not describe generated requests as tested unless their actual execution evidence supports that claim.

### Local edits and preview isolation

Manual request values stay local. The read-review tool returns the original AI proposal, submitted comments, dependency IDs, and the names of locally edited fields. It does not return the edited field values.

Local edits take priority over later AI revisions. This is a field-level merge for method, URL, headers, query, body, bindings, and `dependsOn`. It is not a per-parameter or per-JSON-property merge. Editing one header or query entry makes that entire field locally authoritative; an AI addition within that field can be hidden by the override.

Review previews have a separate execution cache from saved requests. Confirm saves definitions, not preview results or generated inputs. A saved dependent may need **Run chain** before **Send** can reuse its prerequisites, even if its review preview worked.

### Failed preview diagnosis

The diagnosis actions authorize a snapshot of selected failed previews for `get_invocation_diagnostics`. Chat receives only review and diagnosis identifiers. The controller supplies backend-recorded results, original proposals, changed field names, and prerequisite IDs, not private edited request values. It rejects successful, blocked, cancelled, forged, and stale previews. Rerunning previews, revising, confirming, cancelling, replacing, or closing the review invalidates the snapshot.

Response sharing follows the execution tool's local-only policy, with additional limits of 64 KB per failure and 512 KB total. Truncation is explicit and preserves UTF-8 boundaries. The review warns that bodies may contain sensitive data, including values echoed by the application. Non-local chains expose status and timing only.

The agent classifies evidence as a request-configuration problem, likely application bug, environment or authentication blocker, or uncertain cause. Diagnosis cannot change drafts, edit code, or execute requests. Request corrections use existing feedback and **Request changes**. Application investigation requires a separate request. See the README for the user-facing flow.

## Saved-request inspection and reviewed fixes

This flow operates on requests already saved in the tree, including imported and manually created entries. It is separate from discovery feedback, read-only preview diagnosis, and debug replay. See the [README](README.md#inspect-and-fix-saved-requests-with-copilot) for the user-facing flow.

`list_http_invocations` returns IDs, names, groups, methods, prerequisites, structured last-run statuses, ISO timestamps, and available status codes/durations. It does not execute requests or return their values. The status vocabulary and icons are described under [Run status and blocked requests](#run-status-and-blocked-requests).

`get_http_invocation_inspection` requires tool approval because available localhost response evidence may contain sensitive data. `HttpRequestEditors.getInspection` issues an opaque `inspectionId` and returns:

- Current method and URL with embedded query values and URL credentials removed.
- Header/query names, enabled flags, and whether values are present, not the values themselves. Query metadata's `inUrl` flag distinguishes URL query entries from editable parameter rows.
- Body presence, binding selectors, and prerequisite IDs, not request body values.
- Available last-run response or error evidence under the existing locality policy.
- `resultMatchesSavedRequest`, which is false when the execution definition differs from the saved request or matching execution metadata is unavailable.

Changing saved fields does not erase the last-run observation. A stale result can remain visible, but must not be presented as validation of the new definition. Evidence locality follows the captured executed chain, not the current saved URL. Invalid saved URLs can still be inspected; an unparseable URL is omitted.

`propose_http_invocation_changes` accepts saved IDs, current inspection IDs, reasons, and only request fields to replace. Omitted fields retain their private saved values. URL, body, and arrays are whole-field replacements; replacing a URL also replaces embedded query values. Do not claim this is a per-header or per-JSON-property patch.

`CollectionReviews.openChanges` merges proposed fields locally and includes reachable prerequisites for context. The existing review renderer runs in saved-update mode. Apply saves the selected entries atomically with their existing IDs, names, and optional groups; it does not create duplicates, send HTTP, or edit application code. Unchecked entries remain unchanged. The user can edit fields in the review before applying.

Every included saved definition is checked against its captured original before application. A concurrent saved edit rejects the review rather than overwriting it. Cancelling or closing an unapplied review saves nothing. Existing request tabs keep their fields, including unsaved edits; closing and reopening a tab loads the updated saved definition.

Saved-update reviews do not expose their request values through the read-review or diagnosis tools. Feedback-sharing and preview-diagnosis controls are hidden; the user asks in chat for another proposal when needed. Legacy draft operations cannot use a saved-update review as authorization.

Inspection tokens belong to `HttpRequestEditors`, with one current token per inspected invocation. Collection/status changes clear them, as does `closeAll`. A running request cannot be used to authorize a fix. The custom agent no longer has the direct-update `draft_http_invocation` tool; it must use the reviewed-fix flow. After application, execution remains a separate request requiring approval.

## Saved-request debugging prototype

The response panel's **Debug with Copilot** action uses the same custom agent and Microsoft DebugMCP, not the headless `debugmcp/mcp-debugger` project. The agent can add and list breakpoints and inspect debugger status, but its allowed tools do not include launch, stop, step, continue, expression evaluation, or variable-value inspection.

Microsoft DebugMCP is an external VS Code extension/MCP prerequisite, not a repository package dependency. Configure it for GitHub Copilot in VS Code Chat, not Copilot CLI. Installation in one developer's Insiders profile does not configure another checkout or machine. See the README for setup.

`resolveInvocationDebugSession` is the session-resolution seam. It currently requires the active VS Code session and returns its identity and workspace folder; it does not prove that the session serves the request's port. A future chooser or startup flow belongs there. `HttpRequestEditors` accepts the resolver and chat launcher so orchestration can be exercised without a real application debugger.

The invocation runner captures executed definitions, resolved inputs, and source-locality provenance in memory. Debug authorization binds that snapshot to the existing session and saved request. The context tool omits private input values, while the single-use replay tool resends resolved inputs without regenerating values or rerunning prerequisites. Replay retains the original definition's identity for later debugging. Cancellation, debugger termination, editor disposal, and collection replacement still abort it.

Only debug replay passes `timeout: null` through the internal run options to disable the HTTP timeout. Ordinary requests retain the configured timeout, including the previous zero/negative-setting behavior. Do not disable timeouts globally to accommodate breakpoint pauses.

Authorization expires when the saved effective request, last result, active debugger, or collection changes. Comparison ignores empty editor rows and disabled GET/HEAD bodies, which do not change the actual request. Missing, running, cancelled, or blocked results are not eligible. Unsaved editor values are neither saved nor replayed.

The agent uses full source paths for DebugMCP workspace routing, then checks breakpoints and debugger status before replay. It must not resume a debugger that is already paused. The HTTP replay waits while the user inspects and resumes manually. A requested breakpoint is not proof that it binds or hits.

Debug replays do not populate dependency-output caches because their captured inputs can outlive the prerequisite results they originally used. Their responses remain visible and inspectable. A normal run is required before using them as linked sources.

See the README for setup, sharing warnings, and the user-facing flow.

## Request model and execution

The shared contracts are in `src/webviews/azureInvoke/shared/httpRequest.ts`:

```ts
interface HttpInvocation {
    id: string;
    name: string;
    group?: string;
    request: HttpRequest;
}

interface HttpRequest {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
    url: string;
    query: HttpRequestEntry[];
    headers: HttpRequestEntry[];
    body: string;
    bindings?: HttpResponseBinding[];
    dependsOn?: string[];
}
```

Each parameter entry has `name`, `value`, and optional `enabled`. `enabled: false` excludes it from transport but keeps it in the definition. Omitting `enabled` retains the earlier enabled behavior. Filling a value in the UI enables the entry. GET and HEAD body text can remain in a definition but is not sent.

A binding has `{ name, sourceId, pointer }`. It also implies a dependency. `dependsOn` adds prerequisites needed only for ordering. IDs, not display names, connect requests.

### Send versus Run chain

| Action | Execution |
| --- | --- |
| Editor or review **Send** | Run only the target, reusing current successful prerequisite outputs. Report a blocked warning if a required output is unavailable or stale. |
| Editor or review **Run chain** | Execute the reachable prerequisites in dependency order, once each, then the target. |
| MCP `run_http_invocation` | Run the chain by default. Explicit `runDependencies: false` reuses successful cached prerequisites instead. |

Only 2xx responses produce reusable dependency outputs. A non-2xx prerequisite stops execution before its dependent is sent. A non-2xx target response is still an HTTP result and can be inspected; it is not automatically a transport exception.

The runner validates the reachable graph and static templates before performing chain mutations. Missing sources, cycles, unavailable fields, invalid substitutions, and cancellation are surfaced explicitly. Execution reservations prevent overlapping chains from repeating a shared mutation concurrently. Shared prerequisites run once within one chain, not once globally across separate tool calls.

Cached outputs hold the resolved request, response, definition signature, and exact upstream output records used. Changing a source definition or replacing an upstream output invalidates dependent cached results. A failed or newer attempt cannot silently fall back to an older success. Clearing a runner advances an epoch so late completions cannot repopulate its cache.

Cancellation stops pending work and aborts active transport. It cannot undo an already completed POST, PUT, PATCH, or DELETE. There is no automatic cleanup or rollback.

### Run status and blocked requests

`AzureInvokeTreeDataProvider` owns structured run status and its tree presentation. Descriptions show a localized last-run timestamp rather than method or duration. Hover retains status/timing details. The list tool exposes the same state with an ISO timestamp.

| Status | Tree icon | Meaning |
| --- | --- | --- |
| `notRun` | Empty circle | No recorded attempt. |
| `running` | Spinner | Request execution or prerequisite preparation is in progress. |
| `succeeded` | Green pass | The request returned HTTP 2xx, not proof of business assertions. |
| `failed` | Red error | The request itself returned non-2xx or encountered an execution/configuration error. |
| `blocked` | Yellow warning | A successful prerequisite result was unavailable, or a prerequisite failure prevented sending this request. |
| `cancelled` | Circle-slash | Execution was cancelled. |

`InvocationBlockedError` carries the blocked classification through `HttpRequestRunner` into `requestError.blocked`. HTTP and transport failures keep the actual failed prerequisite red. `HttpInvocationRunner` also marks unexecuted transitive dependents within the requested chain as blocked. It does not send them or relabel unrelated requests. Missing/stale cached prerequisite outputs also produce a warning instead of pretending the target failed.

Blocked results are not reusable outputs, independent preview failures to diagnose, or debug replay targets. The review and editor preserve the warning classification across progress messages. Cancellation remains distinct. A later successful run replaces warning icons with the new result.

### Response display

Both the saved editor and review preview use `views/formatResponseBody.ts`. It validates JSON with native `JSON.parse`, then applies `jsonc-parser` whitespace edits using two-space indentation and LF line endings. It does not stringify the parsed value: large integer precision, exponent notation, negative zero, duplicate keys, and original string escapes must survive unchanged.

Invalid JSON and non-JSON bodies display as received. Formatting affects display only, not raw responses, bindings, captured inputs, MCP evidence, or dependency caches.

### Generators, selectors, and substitution

`{{guid}}` is generated lazily with `crypto.randomUUID()` once per request execution. Repeated occurrences share that UUID within the request. Another request or rerun generates a new UUID. `guid` is reserved and cannot be a binding name.

Selectors use JSON Pointer over a virtual result:

| Selector | Source |
| --- | --- |
| `/body/id` | Parsed JSON response body. |
| `/body/items/0/id` | An array item in the response. |
| `/headers/location` | A response header using its lowercase name. |
| `/status` | HTTP status. |
| `/request/body/email` | The resolved JSON request body actually sent by the successful source. |

Escape `/` as `~1` and `~` as `~0` inside property names. Selectors check own properties and do not evaluate JavaScript or JSONPath expressions.

Use quoted placeholders in JSON, such as `{"id":"{{accountId}}"}`. An exact placeholder preserves the selected JSON type, including `false`, `0`, arrays, objects, and `null`. A placeholder embedded in a longer string stays text.

URL substitutions are encoded values and cannot change the host, protocol, or credentials. Dot path segments are rejected. Header, query, and text values require scalar selections. Dynamic JSON property names and header/query field names are forbidden. Disabled parameter values are not resolved. Selected values are not recursively interpreted as templates.

For registration followed by login, use this pattern:

```json
{
  "email": "invoke-{{guid}}@example.com",
  "password": "Invoke!9-{{guid}}"
}
```

Then give login these bindings:

```json
[
  {
    "name": "email",
    "sourceId": "register-user",
    "pointer": "/request/body/email"
  },
  {
    "name": "password",
    "sourceId": "register-user",
    "pointer": "/request/body/password"
  }
]
```

Login's body is `{"email":"{{email}}","password":"{{password}}"}`. These selectors use the generated values actually sent during registration, not its template and not a password echoed by the server. Repeating `{{guid}}` in login would generate different credentials.

The IDs above are illustrative candidate IDs. A guided review translates them on Confirm. Individual saved-request tools use the saved IDs returned by earlier creation.

## MCP and chat integration

The in-process server is **Azure Functions Extension Tools**, provider ID `vscode-azurefunctions.mcp`. Activation creates shared services, registers the provider, and eagerly starts its TCP transport with `@microsoft/vscode-inproc-mcp`.

| Tool | Responsibility |
| --- | --- |
| `create_http_invocation` | Save one complete request directly into the session tree without opening a tab or sending it. |
| `propose_invocation_collection` | Fill the discovery review or replace an explicitly requested revision without saving or sending. |
| `get_invocation_collection_review` | Read submitted feedback with `changesRequested`, or an approved selection with saved IDs and `approved`. |
| `get_invocation_diagnostics` | Read the failed preview snapshots explicitly shared through an active review, without changing or sending requests. |
| `draft_http_invocation` | Legacy approved-case revision by candidate ID. Still registered for existing clients, but excluded from the custom agent and not the reviewed-fix path. |
| `list_http_invocations` | Discover saved IDs, groups, methods, prerequisites, and structured last-run statuses/timestamps. It returns no URLs, bodies, headers, or runtime values. |
| `get_http_invocation_inspection` | Read saved request metadata and bounded last-run evidence with approval, and issue an inspection token. It never sends HTTP or shares private request values directly. |
| `propose_http_invocation_changes` | Validate inspection tokens and open a saved-request update review. Apply preserves IDs and untouched fields; cancellation changes nothing. |
| `get_http_invocation_debug_context` | Read explicitly shared last-run evidence tied to a saved local request and existing debugger. |
| `debug_http_invocation` | Consume debug authorization to replay captured local inputs once with approval, without rerunning prerequisites. |
| `run_http_invocation` | Execute a saved snapshot and normally its prerequisite chain. Marked destructive, open-world, non-idempotent, and `AlwaysRequired` consent guidance. |

The bundled agent in `resources/agents/azure-invoke.agent.md` uses native read/search tools plus the guided, inspection, reviewed-fix, and execution tools. It intentionally omits `create_http_invocation`, legacy `draft_http_invocation`, edit tools, and terminal tools. It should not replace this workflow with curl, generated test files, or application edits.

All eleven tools above are registered in `src/extension.ts`. The custom agent uses the same Azure Invoke profile for authoring, diagnosis, inspection, fixes, and debugging. It additionally allows only `debugmcp/add_breakpoint`, `debugmcp/list_breakpoints`, and `debugmcp/get_debug_status` from Microsoft DebugMCP.

`openAzureInvokeChat` opens `workbench.action.chat.open` in **Azure Invoke** mode. Discovery, feedback, and diagnosis have different prompts; `openInvocationDebugChat` supplies debug IDs and replay instructions. The static `contributes.chatAgents` entry avoids proposed VS Code APIs. Chat launch prompts carry identifiers, not private request/response values.

The legacy draft tool requires an approved authoring review and selected case. This is not a universal prohibition on individual creation: `create_http_invocation` remains available to other clients for explicit individual-request workflows. Neither is a shortcut around the custom agent's review-first saved-request fixes.

### Response sharing

Full responses remain available locally in the UI. MCP sharing is deliberately narrower:

- A direct localhost or literal loopback chain can return the final full body up to 5 MiB and allowlisted response headers.
- Other targets return only final status and duration.
- Any non-local ancestor restricts the final response to status and timing, even when the final target is localhost.
- Authorization, cookies, and custom credential headers are not on the shared header allowlist. Local response bodies can still contain secrets. This policy is not complete credential isolation.
- Manual review previews are not automatically returned to the assistant. An assistant cannot infer their response bodies from the fact that the UI made a request.

The localhost policy is based on the request URL's hostname or literal IP, not proof of server identity or a general network security boundary. Tool consent and the application still matter.

Saved-request inspection and preview diagnosis use bounded snapshots rather than the execution tool's full-body allowance. Truncation is explicit and preserves UTF-8 boundaries. The README owns the user-facing sharing limits and warnings. `getShareableHttpResponse` owns header filtering and optional per-response truncation; preview diagnosis also enforces its combined snapshot budget.

## Persistence and limits

There is one current in-memory collection per extension window. There is no automatic workspace storage, settings persistence, credential vault, review history, or result persistence.

Historical Copilot messages and tool outputs are not live collection state or reusable authorization. The agent must not search chat history, offer restoration, or recreate an empty collection unless explicitly asked. Explicit recreation requires a fresh review and confirmation; historical review, invocation, diagnosis, inspection, and debug identifiers must not be treated as active.

Collection files contain `{ version, invocations }`. Definitions without dependencies serialize as version 1. Definitions with bindings or order-only prerequisites serialize as version 2. Both import; version 1 with dependency links is rejected. GUID-only requests do not require version 2. Both versions support optional invocation groups. Last-run timestamps and status icons are session-only and are not exported.

Exports retain placeholders and selectors, not resolved inputs or captured responses. They can still contain plaintext secrets typed into definitions. Export requires warning confirmation, and imported collections replace rather than merge with the current collection.

Current limits include 5 MiB request/response bodies, at most 100 entries per parameter or dependency list, at most 100 reachable requests per chain, at most 100 proposed review cases, and 2,000 characters per feedback box. Manual names allow up to 100 characters; AI input names allow up to 60.

Transport runs in the extension host using `azureFunctions.requestTimeout`. Requests are not retried and redirects are displayed rather than followed. This avoids accidentally replaying mutations or forwarding credentials to a redirect target.

## Important decisions

| Decision | Reason and consequence |
| --- | --- |
| Custom agent plus a visible AI entry point | Generic tool names were not enough to make API testing discoverable or ensure a consistent authoring flow. The entry point supplies a review ID and concrete instructions. |
| Complete editable proposals before saving | Users can inspect and preview the actual requests rather than approve vague scenario descriptions. |
| Confirm saves directly | Saving should not depend on another model turn. HTTP execution remains a separate action. |
| Feedback requests revisions instead of saving notes | Comments should change the proposal before it becomes the collection. Revision IDs reject stale replies. |
| Headless AI operations | Creating or running a collection should not open dozens of request tabs. Progress belongs in the tree and review. |
| Declarative links, not scripts | Named bindings and order-only prerequisites cover the current workflows without arbitrary JavaScript, eval, or a scripting runtime. |
| Fresh generators plus resolved-input links | Unique registration data can be generated once and reused correctly by login without requiring passwords in responses. |
| Separate Send and Run chain | Repeating setup can create or delete data. The UI distinguishes reuse from fresh prerequisite execution. MCP defaults to fresh chains for runnable authored workflows. |
| Diagnosis before changes | A failed response does not identify whether the request, application, or environment is wrong. Preview diagnosis is read-only; saved-request fixes require review. |
| Warnings for blocked requests | A request that could not run must not look like an independently failed test. Preserve the actual prerequisite failure for investigation. |
| Captured-input debug replay | Breakpoint investigation should repeat the selected request, not regenerate inputs or rerun mutating setup. Debug-session selection/startup remains a separate future concern. |
| Whitespace-only JSON formatting | Readable responses must not alter values used by bindings or lose numeric precision. |
| Conservative remote response sharing | The user chose full localhost responses and status/timing only for non-local chains. |
| Explicit file persistence | The prototype avoids silently storing credentials or captured results on disk. |

## Code map

Commands, tree ownership, localization, action contexts, and disposables follow the Azure Functions extension's existing conventions. Webviews and in-process MCP integration use the shared Azure Tools packages, following the Azure Resource Groups pattern rather than introducing another framework. Keep tool and command adapters thin; the shared request and review services own behavior.

| Files | Ownership |
| --- | --- |
| `package.json`, `package.nls.json` | View, commands, welcome actions, titles, custom agent, and MCP contributions. |
| `src/extension.ts` | Service lifetimes, tree creation, command wiring, and MCP registration. |
| `src/commands/azureInvoke/` | Manual entry, import/export, AI entry point, and chat prompts. `resolveInvocationDebugSession.ts` owns the future debug-session chooser/startup seam. |
| `src/tree/azureInvoke/AzureInvokeTreeDataProvider.ts` | Saved snapshots, groups, structured statuses/timestamps, warning/failure icons, narrow progress updates, and atomic batch saves. |
| `src/tree/azureInvoke/invocationCollection.ts` | Snapshot copying, format validation, import/export, and graph planning. |
| `src/webviews/azureInvoke/shared/` | Request, dependency, review, and message contracts. |
| `src/webviews/azureInvoke/extension/CollectionReviews.ts` | Authoring/revision state, local-edit priority, ID translation, and saved-update review snapshots/application guards. |
| `src/webviews/azureInvoke/extension/CollectionReviewController.ts` | Review lifecycle, isolated preview cache, diagnosis capture/budgets, authoring versus saved-update mode, and chat continuation. |
| `src/webviews/azureInvoke/extension/HttpRequestEditors.ts`, `HttpRequestController.ts` | Saved editor lifetimes, execution, inspection tokens, stale-result metadata, debug authorization, and response-panel actions. |
| `src/webviews/azureInvoke/extension/HttpInvocationRunner.ts` | Chains, reservations, dependency caches, blocked propagation, last-run resolved inputs, and captured locality provenance. |
| `src/webviews/azureInvoke/extension/HttpRequestRunner.ts`, `sendHttpRequest.ts` | Request progress, `InvocationBlockedError`, cancellation, debug-only timeout opt-out, transport, safe response sharing, and limits. |
| `src/webviews/azureInvoke/extension/requestBindings.ts` | Static template checks, GUIDs, pointer selection, and safe substitution. |
| `src/webviews/azureInvoke/views/` | HTTP editor, compact review, reusable request preview, dependency editor, searchable picker, and CSS. |
| `src/webviews/azureInvoke/views/formatResponseBody.ts` | Shared display-only JSON formatter. |
| `src/chat/tools/azureInvoke/` | MCP schemas and thin adapters into the shared services. |
| `src/chat/tools/azureInvoke/savedHttpInvocationTools.ts` | Saved inspection and reviewed field-replacement tool contracts. |
| `src/chat/tools/azureInvoke/debugHttpInvocationTools.ts` | Debug context and single-use, approved replay tool contracts. |
| `resources/agents/azure-invoke.agent.md` | Session boundaries, discovery, revisions, diagnosis, reviewed fixes, breakpoint/replay instructions, and execution/reporting rules. |
| `esbuild.mjs` | Separate browser bundles for the request editor and collection review. |
| `test/azureInvoke.test.ts` | Native webview, HTTP fixture, MCP protocol, persistence, and dependency regression coverage. |

### Implementation traps already encountered

- Use `zod/mini`. A no-input MCP tool must use `z.void()`, not `z.object({})`. The in-process package rejects empty object schemas, which can make MCP initialization fail with HTTP 500.
- Use this extension's Azure Tools telemetry/error wrapper for tool execution. Nested Azure Tools package versions have incompatible context types.
- The shared webview package reserves `confirm` and `cancel` and can dispose the panel for those names. Review messages use `confirmCollection`, `requestChanges`, and `cancelCollection`.
- Webview initial data is URI-encoded JSON embedded in a single-quoted script string. Apostrophes need explicit `%27` escaping because `encodeURIComponent` leaves them unchanged.
- Proposal versions and atomic proposal/state snapshots distinguish genuine same-ID revisions from readiness replay. Request progress also has monotonic sequence numbers. Do not remove these checks or stale messages can overwrite current fields or leave controls busy.
- Hidden webview timers are throttled. Test waits use DOM mutation and message events instead of rapid polling.
- `runEditorScript` reloads a real webview from cached initial HTML. Each injection needs a unique interaction marker; VS Code ignores an identical HTML assignment, which otherwise hangs repeated interactions. Keep continuous DOM edits in one call, or save and reopen.
- Review test interactions wait for the initial `proposal` and defer until the renderer finishes applying it. Resolving immediately inside an earlier message listener can target detached old DOM. Preserve the synchronization and monotonic proposal/progress guards.
- Always include `test/global.test.ts` in native test runs. Its shared Azure Tools initialization is required; omitting it can produce misleading generic network errors.
- Preserve ordinary HTTP timeout behavior when changing debug replay. Only an explicit internal `null` disables the timeout, and cancellation must remain available.
- Command toolbar arguments can be metadata rather than a file URI. Import/export handlers guard the argument shape.
- Do not edit generated `main.js`. This work leaves it unchanged.

## Validation checkpoint

The latest implementation pass completed `npm run check`, `npm run lint`, `npm run build`, and all 68 native Azure Invoke tests on VS Code 1.141.0. The package still declares VS Code 1.106 as its minimum; the latest pass was not a new minimum-version compatibility check.

Earlier review layout checks covered 360px and 960px in light and dark themes. Do not treat those checks as a new visual pass for the saved-fix or debugging additions. The suite does not establish that a signed-in model discovers every endpoint, authors valid requests for an external application, or chooses breakpoints that bind and hit in that application.

To reproduce the focused validation:

```sh
npm run check
npm run lint
npm run build
./node_modules/.bin/vscode-test \
  --run test/global.test.ts test/azureInvoke.test.ts \
  --code-version 1.141.0 \
  --skip-extension-dependencies
git diff --check
git diff --exit-code -- main.js
```

Use the focused runner rather than `npm test` for this pass. The npm pretest script can modify the user-level Core Tools installation. Skipping extension dependency installation avoids an unrelated installer failure encountered during prototype work.

The suite exercises actual webview bundles and MCP protocol against local HTTP fixtures. Coverage includes generated credential reuse, typed substitutions, encoded paths, stale caches, invalid graph preflight, cancellation, concurrency, privacy propagation, atomic saving, feedback loops, same-ID revisions, and readiness/progress races. Recent regressions cover:

- Session-only groups, status icons/timestamps, and export behavior.
- JSON display formatting without rewriting original tokens.
- Explicit preview diagnosis, stale/private-edit guards, and bounded response sharing.
- Saved-request status discovery, inspection metadata, partial reviewed fixes, unchanged fields/IDs, unchecked entries, cancellation, and concurrent-edit rejection.
- Debug session guards, single-use authorization, exact resolved-input replay, no prerequisite reruns, timeout opt-out, cancellation, locality, and dependency-cache safety.
- Warning icons for HTTP- and transport-blocked transitive dependents, MCP `blocked` status, exclusion from independent diagnosis/debugging, and recovery after a successful rerun.

Known test-output noise includes warnings from the installed Azure Resource Groups extension about missing `.copilot-azure/sessions` folders and an MCP SDK JSON-schema fallback warning. The latter does not mean MCP initialization failed. Do not modify another installed extension's bundle to hide this output.

## Paused registration-to-login investigation

This is an unresolved report, not an identified resolver bug. No requests were executed by the assistant during diagnosis, and no collection changes were made for it.

The user reported a manual review preview against a Go REST API using Fiber v3 at `http://localhost:3000`. The proposal had 35 requests across Health, Auth, Users, Accounts, Holdings, Benchmarks, Snapshots, and Snapshot Values. Whether that review had been confirmed or saved was not established. Review IDs are session-only and should not be treated as durable handles after restarting.

The reported definitions were:

- `register-user`: anonymous `POST /api/v2/register`, JSON content type, and the GUID-backed registration body shown earlier.
- `login-user`: anonymous `POST /api/v2/login`, with `/request/body/email` and `/request/body/password` bindings from `register-user`.
- Later protected requests select `/body/data/token` from login and use `Authorization: Bearer {{token}}`.

The reported application contract, not independently checked against the running service, was:

- Registration succeeds with 201 and `{"status":201,"data":{"user":{...}}}`. The user includes `user_id` and email, but no password or login token.
- Email must be valid and unique case-insensitively. Password length is 5-60 characters. The intended `Invoke!9-` plus UUID password is 45 characters, but the actual outgoing inputs have not been inspected.
- Login succeeds with 201 and `{"status":201,"data":{"token":"...","user":{...}}}`.
- New users have DEFAULT rather than ADMIN privileges. `REQUIRE_VERIFICATION` defaults to false, but the actual runtime setting is unknown.

The exact displayed error was:

```text
A prerequisite returned a non-success status. The chain stopped before sending the dependent request.
```

In the current `HttpInvocationRunner`, this message comes from checking a freshly executed prerequisite's HTTP status before resolving the dependent request's bindings. If registration is indeed the sole prerequisite and this error belongs to that attempt, inspect registration first. A missing cached success, missing selected field, or non-JSON source request produces a different error.

This outcome now gives the unexecuted dependent a `blocked` status and warning icon; it does not turn the prerequisite's failure into a warning or establish that the dependent's configuration is wrong. The new saved inspection/fix tools and debug replay do not resolve this historical report by themselves.

The selected sources and pointer strings looked correct in the user's description. Seeing `{{email}}` and `{{password}}` in the editor is expected because substitution is execution-time. None of that verifies the actual runtime result.

Minimal evidence still needed:

1. Registration's status and sanitized error message from the existing response section for that attempt.
2. Whether the action was Send or Run chain, and its timestamp, to distinguish cached reuse from fresh execution.
3. Matching server log lines containing only method, path, status, and timestamp, to establish whether registration and login reached the application.

Do not rerun a mutating chain merely to collect a screenshot. Do not ask for real passwords, tokens, cookies, full request bodies, or full response bodies. Do not replace the linked credentials with hardcoded values.

If registration is verified as 2xx for the same attempt, investigate result handling and input bindings with synthetic fixtures or local debugger checks. Compare selected source IDs, placeholder resolution, input types, and source/login equality in memory; share only non-sensitive booleans or lengths, not credential values. Verification and privilege checks become relevant only after the corresponding downstream requests actually run.

The user chose to defer this investigation. The next step is evidence collection, not an assumed fix.

## Remaining prototype limits

There is no automatic draft-validation/repair loop, collection-wide assertion runner, teardown policy, environment manager, secure secret store, automatic host startup, or non-HTTP execution. Running several targets through separate MCP calls can rerun their setup separately.

Debug replay still assumes that the active session is the intended application debugger. Matching the HTTP target to a session, choosing among sessions, and starting/attaching one are future work at `resolveInvocationDebugSession`, not behavior to add implicitly to the agent prompt.

Saved-request fixes preserve private values only for omitted fields, not individual properties within a replaced body, array, or URL. Existing open tabs intentionally keep their fields after application. More granular patches, before/after diffs, and synchronized clean-editor refresh would be separate UX changes.

The generic prerequisite failure message does not identify the failing source or its status in the dependent's error. The source's local preview retains its response, but surfacing safe source/status metadata would make diagnosis easier without automatically exposing bodies to AI.

The revised native chat flow has protocol and webview coverage, but still needs signed-in Copilot smoke testing. Check discovery completeness, feedback rerendering, inspection and reviewed fixes in a later conversation, approval for mutating chains, and actual breakpoint selection/hits. Do not infer improved authoring quality from passing extension tests or treat the user's report of poorer drafts as an identified root cause.
