# Skill Files Reference

## Overview

Skill files are Markdown documents bundled in `resources/skills/` that define best-practice rules for the [Function App Validator](./validation.md). The LLM reads these files as its system prompt and returns structured JSON findings based on the rules.

Two layers of skill files are used:
- **`functionapp.md`** — common rules applied to ALL runtimes.
- **`<runtime>.md`** (e.g. `python.md`) — language-specific rules that supplement the common ones.

Both files are concatenated (common first, separated by `---`) before being sent to the LLM.

---

## File Locations

```
resources/skills/
  functionapp.md      ← common rules (all runtimes)
  python.md           ← Python-specific rules
  node.md             ← (future) Node.js rules
  dotnet.md           ← (future) .NET rules
  java.md             ← (future) Java rules
  powershell.md       ← (future) PowerShell rules
```

---

## Rule Format

Each rule follows this format:

```markdown
- RULE <code> [<severity>]: <description>
```

- **`code`**: Unique identifier (e.g. `AF001`). Used as the diagnostic code in VS Code Problems panel and links to the docs URL.
- **`severity`**: `error`, `warning`, or `info`.
- **`description`**: Full explanation including what the violation is and how to fix it. Examples and code snippets are encouraged.

---

## `functionapp.md` — Common Rules (All Runtimes)

### host.json

| Rule | Severity | Description |
|---|---|---|
| `AF001` | warning | `extensionBundle` version range should be `[4.*, 5.0.0)` or later |
| `AF002` | info | Application Insights sampling not explicitly configured |
| `AF003` | info | `extensions.http.routePrefix` not customized (defaults to `"api"`) |
| `AF011` | warning | `functionTimeout` not set explicitly |

### local.settings.json

| Rule | Severity | Description |
|---|---|---|
| `AF005` | error | `AzureWebJobsStorage` missing |

### Project Structure

| Rule | Severity | Description |
|---|---|---|
| `AF009` | warning | `.funcignore` missing — all files uploaded during deployment |
| `AF013` | warning | `host.json` missing from project root |

### Security

| Rule | Severity | Description |
|---|---|---|
| `AF050` | error | Secrets / connection strings committed to source control |
| `AF051` | warning | HTTP function uses `authLevel: "anonymous"` without explicit justification |
| `AF052` | warning | Credentials hardcoded in code instead of environment variables / Key Vault |
| `AF053` | info | Connection string secrets used instead of Managed Identity |

### Architecture

| Rule | Severity | Description |
|---|---|---|
| `AF014` | info | SDK calls used where Azure Functions bindings would suffice |
| `AF015` | info | Long-running workflow uses `functionTimeout` instead of Durable Functions |

---

## `python.md` — Python-Specific Rules

### local.settings.json

| Rule | Severity | Description |
|---|---|---|
| `AF004` | error | `FUNCTIONS_WORKER_RUNTIME` missing or not `"python"` |
| `AF012` | info | `PYTHON_ENABLE_DEBUG_LOGGING=1` left enabled (too verbose for production) |

### v1 Model Rules _(only when `function.json` files are present)_

| Rule | Severity | Description |
|---|---|---|
| `AF020` | warning | `scriptFile` in `function.json` points to wrong path |
| `AF021` | warning | `function.json` has more than one trigger binding |
| `AF022` | info | Project is using v1 model — consider migrating to v2 (decorator-based) |

### v2 Model Rules _(only when NO `function.json` files are present)_

| Rule | Severity | Description |
|---|---|---|
| `AF030` | error | `FunctionApp` not instantiated or instantiated more than once at module scope |
| `AF031` | warning | `@app.route()` uses `AuthLevel.ANONYMOUS` |
| `AF032` | info | Timer trigger should use `@app.schedule()` decorator |

### Code Quality

| Rule | Severity | Description |
|---|---|---|
| `AF100` | error | Logging secrets / connection strings / environment variable values |
| `AF101` | warning | Azure SDK clients created inside handler body instead of module scope |
| `AF102` | warning | Synchronous/blocking calls inside `async def` handler (see details below) |
| `AF103` | warning | Bare `except Exception: pass` swallows errors silently |
| `AF104` | info | HTTP trigger returns without explicit `status_code` |
| `AF105` | warning | Timer-triggered function is not idempotent |
| `AF106` | info | `print()` used instead of `logging.*` |
| `AF107` | warning | Heavy libraries (`pandas`, `numpy`, `torch`) imported at top level |
| `AF108` | warning | Large dataset / model loaded into memory per invocation (OOM / signal 137 risk) |
| `AF109` | warning | `pyodbc` connections not thread-local (connection collision / signal 139 risk) |

#### AF102 — Blocking calls in async handlers

The following synchronous patterns are flagged when found inside an `async def` handler:

| Blocking | Async alternative |
|---|---|
| `requests.get/post/…` | `aiohttp.ClientSession` or `httpx.AsyncClient` |
| `urllib.request.urlopen` | `aiohttp` or `httpx` |
| `boto3` client calls | `aioboto3` / `aiobotocore` |
| `psycopg2` (PostgreSQL) | `asyncpg` or `psycopg3` async |
| `pymysql` / `mysql.connector` | `aiomysql` |
| `pymongo` (MongoDB) | `motor` |
| `redis.StrictRedis` / `redis.Redis` | `aioredis` or `redis.asyncio` |
| `pyodbc` | `aioodbc` or `loop.run_in_executor()` |
| `time.sleep(n)` | `await asyncio.sleep(n)` |
| Synchronous file I/O | `aiofiles` or executor |

### Dependency & Packaging

| Rule | Severity | Description |
|---|---|---|
| `AF110` | error | `requirements.txt` or `uv.lock` missing |
| `AF111` | warning | Dependency versions not pinned in `requirements.txt` |
| `AF112` | info | `azure-functions` version older than `1.17.0` |
| `AF113` | warning | `requirements.txt` generated via `pip freeze` (OS-specific packages, Linux failure risk) |
| `AF114` | warning | Package in `requirements.txt` may not have Linux-compatible wheels |
| `AF115` | info | `scmDoBuildDuringDeployment` not enabled (recommended for Linux Python apps) |

---

## Adding Rules

1. Open the appropriate skill file (`functionapp.md` for cross-runtime, `python.md` for Python-only).
2. Add a new rule entry:
   ```markdown
   - RULE AF200 [warning]: <clear description with example of bad vs good code>
   ```
   Use the next available code number in the relevant block.
3. Optionally add a code example (Markdown code fences) for clarity.
4. No code changes needed — the validator picks up rule file changes automatically on the next run (files are read from disk at runtime).

---

## Adding a New Runtime Skill File

1. Create `resources/skills/<runtime>.md` modelled after `python.md`.
2. Open `src/commands/validateFunctionApp/FunctionAppValidator.ts` and add to `runtimeToSkillFile`:
   ```typescript
   const runtimeToSkillFile: Record<string, string> = {
       python: 'python.md',
       node: 'node.md',    // ← new entry
   };
   ```
3. Ensure the file is included in the VSIX by adding it to `.vscodeignore` exclusion list (or confirming `resources/**` is already included).

---

## LLM Output Contract

Skill files must include this instruction block (already present in `functionapp.md`):

```
Return ONLY valid JSON — no markdown fences, no explanation text before or after.
The JSON must conform exactly to this schema:

{
  "findings": [
    {
      "rule": "AF001",
      "severity": "warning",
      "file": "host.json",
      "line": null,
      "message": "..."
    }
  ]
}
```

The validator's `parseLlmResponse()` function strips markdown fences as a fallback, but the instruction to return raw JSON is the primary guard.
