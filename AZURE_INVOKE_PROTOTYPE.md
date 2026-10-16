# Azure Invoke prototype handoff

This document captures the prototype as of October 16, 2026. The intended checkpoint branch is `mwf/azure-invoke-proto`. It includes the earlier scaffold and MCP commits, the collection and dependency work, and this handoff.

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

The browser pages used during development were temporary previews of the webview bundle. Their local servers have been stopped. They are not connected to a running extension or a real collection.

## What is built

| Area | Current behavior |
| --- | --- |
| View and manual entry | A dedicated Azure Invoke tree, add-trigger quick pick, manual HTTP editor, and AI authoring entry point. Other trigger types are listed but not executable. |
| HTTP editor | Method, absolute URL, query parameters, headers, body, editable name, explicit Save, Send, cancellation, and status/timing/headers/body display. |
| Saved requests | Stable IDs and session-only snapshots. Reopen an entry to edit it or inspect its last full response. Unsaved editor changes are not the saved snapshot used by MCP. |
| Collection files | Explicit JSON import/export. Import replaces the current collection and closes request editors after confirmation. Export warns that definitions can contain plaintext credentials. |
| Dependencies | Searchable prerequisite/source pickers, order-only prerequisites, response and resolved-input selectors, and variable substitution. |
| Runtime generation | `{{guid}}` generates one UUID per request execution, shared across its occurrences within that request. |
| Guided AI authoring | Workspace discovery through a bundled custom agent, a grouped editable review, manual previews, iterative feedback, and direct saving on Confirm. |
| MCP execution | Headless creation, review tools, saved-request discovery, and execution with prerequisite chains and restricted response sharing. |
| Progress | Loading and revision indicators, per-request progress, tree statuses, and cached results available without automatically opening many editors. |

Manual and AI-created requests use the same execution implementation. AI creation and execution stay headless. An editor opens when the user asks to inspect a request, not for every tool-created entry.

## Guided authoring and review

The flow is:

```text
Author Collection with AI
  -> loading review + Azure Invoke chat
  -> agent reads project source and proposes complete request templates
  -> grouped editable review
       -> Send / Run chain: real HTTP previews, no collection save
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

Proposal candidate IDs are translated together into new stable saved invocation IDs. Groups, authentication annotations, descriptions, and feedback belong to the review; they are not fields in the saved invocation format. The saved tree is currently flat.

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

### Local edits and preview isolation

Manual request values stay local. The read-review tool returns the original AI proposal, submitted comments, dependency IDs, and the names of locally edited fields. It does not return the edited field values.

Local edits take priority over later AI revisions. This is a field-level merge for method, URL, headers, query, body, bindings, and `dependsOn`. It is not a per-parameter or per-JSON-property merge. Editing one header or query entry makes that entire field locally authoritative; an AI addition within that field can be hidden by the override.

Review previews have a separate execution cache from saved requests. Confirm saves definitions, not preview results or generated inputs. A saved dependent may need **Run chain** before **Send** can reuse its prerequisites, even if its review preview worked.

## Request model and execution

The shared contracts are in `src/webviews/azureInvoke/shared/httpRequest.ts`:

```ts
interface HttpInvocation {
    id: string;
    name: string;
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
| Editor or review **Send** | Run only the target, reusing current successful prerequisite outputs. Fail if a required output is unavailable or stale. |
| Editor or review **Run chain** | Execute the reachable prerequisites in dependency order, once each, then the target. |
| MCP `run_http_invocation` | Run the chain by default. Explicit `runDependencies: false` reuses successful cached prerequisites instead. |

Only 2xx responses produce reusable dependency outputs. A non-2xx prerequisite stops execution before its dependent is sent. A non-2xx target response is still an HTTP result and can be inspected; it is not automatically a transport exception.

The runner validates the reachable graph and static templates before performing chain mutations. Missing sources, cycles, unavailable fields, invalid substitutions, and cancellation are explicit failures. Execution reservations prevent overlapping chains from repeating a shared mutation concurrently. Shared prerequisites run once within one chain, not once globally across separate tool calls.

Cached outputs hold the resolved request, response, definition signature, and exact upstream output records used. Changing a source definition or replacing an upstream output invalidates dependent cached results. A failed or newer attempt cannot silently fall back to an older success. Clearing a runner advances an epoch so late completions cannot repopulate its cache.

Cancellation stops pending work and aborts active transport. It cannot undo an already completed POST, PUT, PATCH, or DELETE. There is no automatic cleanup or rollback.

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
| `draft_http_invocation` | Revise an approved saved case by candidate ID without duplicating it. It is not the normal Confirm implementation. |
| `list_http_invocations` | Discover saved IDs, names, methods, and prerequisite IDs. It returns no URLs, bodies, headers, or runtime values. |
| `run_http_invocation` | Execute a saved snapshot and normally its prerequisite chain. Marked destructive, open-world, non-idempotent, and `AlwaysRequired` consent guidance. |

The bundled agent in `resources/agents/azure-invoke.agent.md` uses native read/search tools plus the guided, listing, and execution tools. It intentionally omits `create_http_invocation`, edit tools, and terminal tools. It should not replace this workflow with curl, generated test files, or application edits.

`openAzureInvokeChat` opens `workbench.action.chat.open` in **Azure Invoke** mode. Discovery and feedback have different prompts. The static `contributes.chatAgents` entry avoids proposed VS Code APIs.

The guided draft tool requires approval, but this is not a universal prohibition on individual creation. `create_http_invocation` remains available to other clients for explicit individual-request workflows.

### Response sharing

Full responses remain available locally in the UI. MCP sharing is deliberately narrower:

- A direct localhost or literal loopback chain can return the final full body up to 5 MiB and allowlisted response headers.
- Other targets return only final status and duration.
- Any non-local ancestor restricts the final response to status and timing, even when the final target is localhost.
- Authorization, cookies, and custom credential headers are not on the shared header allowlist. Local response bodies can still contain secrets. This policy is not complete credential isolation.
- Manual review previews are not automatically returned to the assistant. An assistant cannot infer their response bodies from the fact that the UI made a request.

The localhost policy is based on the request URL's hostname or literal IP, not proof of server identity or a general network security boundary. Tool consent and the application still matter.

## Persistence and limits

There is one current in-memory collection per extension window. There is no automatic workspace storage, settings persistence, credential vault, review history, or result persistence.

Collection files contain `{ version, invocations }`. Definitions without dependencies serialize as version 1. Definitions with bindings or order-only prerequisites serialize as version 2. Both import; version 1 with dependency links is rejected. GUID-only requests do not require version 2.

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
| Conservative remote response sharing | The user chose full localhost responses and status/timing only for non-local chains. |
| Explicit file persistence | The prototype avoids silently storing credentials or captured results on disk. |

## Code map

Commands, tree ownership, localization, action contexts, and disposables follow the Azure Functions extension's existing conventions. Webviews and in-process MCP integration use the shared Azure Tools packages, following the Azure Resource Groups pattern rather than introducing another framework. Keep tool and command adapters thin; the shared request and review services own behavior.

| Files | Ownership |
| --- | --- |
| `package.json`, `package.nls.json` | View, commands, welcome actions, titles, custom agent, and MCP contributions. |
| `src/extension.ts` | Service lifetimes, tree creation, command wiring, and MCP registration. |
| `src/commands/azureInvoke/` | Manual entry, import/export, AI entry point, and chat prompts. |
| `src/tree/azureInvoke/AzureInvokeTreeDataProvider.ts` | Saved snapshots, narrow progress updates, and atomic batch saves. |
| `src/tree/azureInvoke/invocationCollection.ts` | Snapshot copying, format validation, import/export, and graph planning. |
| `src/webviews/azureInvoke/shared/` | Request, dependency, review, and message contracts. |
| `src/webviews/azureInvoke/extension/CollectionReviews.ts` | Active review, feedback snapshots, revision guards, local-edit priority, approval, and ID translation. |
| `src/webviews/azureInvoke/extension/CollectionReviewController.ts` | Review webview lifecycle, preview cache, state snapshots, and chat continuation. |
| `src/webviews/azureInvoke/extension/HttpRequestEditors.ts`, `HttpRequestController.ts` | Saved editor lifetimes and shared saved-request execution. |
| `src/webviews/azureInvoke/extension/HttpInvocationRunner.ts` | Chains, reservations, successful outputs, invalidation, and response-shareability checks. |
| `src/webviews/azureInvoke/extension/HttpRequestRunner.ts`, `sendHttpRequest.ts` | Per-request progress, cancellation, transport, and limits. |
| `src/webviews/azureInvoke/extension/requestBindings.ts` | Static template checks, GUIDs, pointer selection, and safe substitution. |
| `src/webviews/azureInvoke/views/` | HTTP editor, compact review, reusable request preview, dependency editor, searchable picker, and CSS. |
| `src/chat/tools/azureInvoke/` | Six MCP schemas and thin adapters into the shared services. |
| `resources/agents/azure-invoke.agent.md` | AI discovery, drafting defaults, revisions, dependency authoring, and execution/reporting rules. |
| `esbuild.mjs` | Separate browser bundles for the request editor and collection review. |
| `test/azureInvoke.test.ts` | Native webview, HTTP fixture, MCP protocol, persistence, and dependency regression coverage. |

### Implementation traps already encountered

- Use `zod/mini`. A no-input MCP tool must use `z.void()`, not `z.object({})`. The in-process package rejects empty object schemas, which can make MCP initialization fail with HTTP 500.
- Use this extension's Azure Tools telemetry/error wrapper for tool execution. Nested Azure Tools package versions have incompatible context types.
- The shared webview package reserves `confirm` and `cancel` and can dispose the panel for those names. Review messages use `confirmCollection`, `requestChanges`, and `cancelCollection`.
- Webview initial data is URI-encoded JSON embedded in a single-quoted script string. Apostrophes need explicit `%27` escaping because `encodeURIComponent` leaves them unchanged.
- Proposal versions and atomic proposal/state snapshots distinguish genuine same-ID revisions from readiness replay. Request progress also has monotonic sequence numbers. Do not remove these checks or stale messages can overwrite current fields or leave controls busy.
- Hidden webview timers are throttled. Test waits use DOM mutation and message events instead of rapid polling.
- `runEditorScript` reloads a real webview from its cached initial HTML on every call. Keep continuous DOM edits in one call, wait for host restoration, or save and reopen.
- Command toolbar arguments can be metadata rather than a file URI. Import/export handlers guard the argument shape.
- Do not edit generated `main.js`. This work leaves it unchanged.

## Validation checkpoint

The last implementation pass completed `npm run build`, `npm run lint`, and 46 native Azure Invoke tests. It also checked the review at 360px and 960px in light and dark themes. These checks do not establish that a signed-in Copilot model conversation discovers every endpoint or that an external application's requests succeed.

To reproduce the focused validation:

```sh
npm run build
npm run lint
./node_modules/.bin/vscode-test \
  --run test/global.test.ts test/azureInvoke.test.ts \
  --grep 'Azure Invoke' \
  --code-version 1.106.0 \
  --skip-extension-dependencies
git diff --check
git diff --exit-code -- main.js
```

Use the focused runner rather than `npm test` for this pass. The npm pretest script can modify the user-level Core Tools installation. Skipping extension dependency installation avoids an unrelated installer failure encountered during prototype work.

The suite exercises the actual webview bundles and MCP protocol against local HTTP fixtures. Coverage includes generated credential reuse, typed substitutions, encoded paths, stale caches, invalid graph preflight, cancellation, concurrency, privacy propagation, atomic saving, feedback loops, same-ID revisions, and readiness/progress races.

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

The selected sources and pointer strings looked correct in the user's description. Seeing `{{email}}` and `{{password}}` in the editor is expected because substitution is execution-time. None of that verifies the actual runtime result.

Minimal evidence still needed:

1. Registration's status and sanitized error message from the existing response section for that attempt.
2. Whether the action was Send or Run chain, and its timestamp, to distinguish cached reuse from fresh execution.
3. Matching server log lines containing only method, path, status, and timestamp, to establish whether registration and login reached the application.

Do not rerun a mutating chain merely to collect a screenshot. Do not ask for real passwords, tokens, cookies, full request bodies, or full response bodies. Do not replace the linked credentials with hardcoded values.

If registration is verified as 2xx for the same attempt, investigate result handling and input bindings with synthetic fixtures or local debugger checks. Compare selected source IDs, placeholder resolution, input types, and source/login equality in memory; share only non-sensitive booleans or lengths, not credential values. Verification and privilege checks become relevant only after the corresponding downstream requests actually run.

The user chose to defer this investigation. The next step is evidence collection, not an assumed fix.

## Remaining prototype limits

There is no collection-wide assertion runner, teardown policy, environment manager, secure secret store, automatic host startup, or non-HTTP execution. Running several targets through separate MCP calls can rerun their setup separately.

The generic prerequisite failure message does not identify the failing source or its status in the dependent's error. The source's local preview retains its response, but surfacing safe source/status metadata would make diagnosis easier without automatically exposing bodies to AI.

The revised native chat flow has protocol and webview coverage, but still needs a signed-in Copilot smoke test. Check discovery completeness, feedback rerendering, saved-request discovery in a later conversation, and how the model requests approval for mutating chains.
