# Azure Functions Python-Specific Best Practices

These rules supplement the common Azure Functions rules already listed above.
Apply all of them together with the common rules.

---

## local.settings.json — Python-Specific

- RULE AF004 [error]: `Values.FUNCTIONS_WORKER_RUNTIME` must be present and set to
  `"python"`. Without it the Functions host cannot start the Python worker.

- RULE AF012 [info]: `Values.PYTHON_ENABLE_DEBUG_LOGGING` being set to `"1"` is useful
  during development but is very verbose. Confirm it is removed or set to `"0"` before
  deploying to production.

---

## Python Programming Model Detection

Determine which programming model the project uses before applying model-specific rules:

- **v1 (legacy)**: One or more `function.json` files exist anywhere in the project tree.
  Each function lives in its own sub-folder with a `function.json` and typically an
  `__init__.py`.
- **v2 (current)**: NO `function.json` files exist anywhere. Functions are declared
  using decorators directly in `.py` files (e.g. `@app.route(...)`,
  `@app.timer_schedule(...)`).

**IMPORTANT**: Only apply v1-specific rules when `function.json` files are present in
the provided project files. Only apply v2-specific rules when NO `function.json` files
are present.

---

## v1-Specific Rules (only when `function.json` files are present)

- RULE AF020 [warning]: `function.json` `scriptFile` should point to `__init__.py` or be
  omitted entirely. An incorrect path causes a silent load failure at startup.

- RULE AF021 [warning]: Each `function.json` must declare exactly one trigger binding.
  Multiple triggers in a single function definition are not supported by the runtime.

- RULE AF022 [info]: The project is using the v1 programming model (indicated by the
  presence of `function.json` files). Consider migrating to v2, which uses decorators,
  eliminates per-function `function.json`, and aligns with modern Python frameworks. See:
  https://learn.microsoft.com/azure/azure-functions/functions-reference-python

---

## v2-Specific Rules (only when NO `function.json` files are present)

- RULE AF030 [error]: The `azure-functions` package must be imported and `FunctionApp`
  must be instantiated exactly once at module scope (e.g. `app = func.FunctionApp()`).
  Multiple `FunctionApp` instances in the same project cause routing conflicts.

- RULE AF031 [warning]: `http_auth_level` on `@app.route()` decorators should not be
  `func.AuthLevel.ANONYMOUS` unless there is an explicit reason (e.g. a public webhook
  with its own HMAC validation). `func.AuthLevel.FUNCTION` and `func.AuthLevel.ADMIN`
  are both correct and secure choices — do NOT flag them. Only flag `ANONYMOUS`.

- RULE AF032 [info]: Use `@app.schedule()` instead of a separate Timer trigger
  `function.json` for cleaner, co-located scheduling logic (v2 model only).

---

## Python Code Quality Rules (all Python projects)

- RULE AF100 [error]: Never log secrets, connection strings, or SAS tokens. Calls such
  as `logging.info(os.environ["AzureWebJobsStorage"])` or any log/print of environment
  variables containing credentials are a security risk.

- RULE AF101 [warning]: Do not create Azure SDK client objects (e.g. `BlobServiceClient`,
  `CosmosClient`, `ServiceBusClient`) inside the function handler body. Client creation
  is expensive and bypasses connection pooling. Instantiate clients at module scope so
  they are reused across invocations.

  Bad:
  ```python
  def main(req):
      client = BlobServiceClient.from_connection_string(conn_str)  # recreated every call
  ```
  Good:
  ```python
  client = BlobServiceClient.from_connection_string(conn_str)  # module scope
  def main(req):
      ...
  ```

- RULE AF102 [warning]: Avoid synchronous (blocking) calls inside `async def` function
  handlers. Blocking the event loop stalls ALL concurrent invocations on the same worker
  and negates the benefits of async execution. The following patterns are prohibited in
  async handlers:

  **Blocking HTTP / network calls — use async alternatives:**
  - `requests.get/post/put/delete` → use `aiohttp.ClientSession` or `httpx.AsyncClient`
  - `urllib.request.urlopen` → use `aiohttp` or `httpx`
  - `boto3` client calls (AWS SDK) → use `aioboto3` or `aiobotocore`
  - `google-cloud-*` synchronous clients → prefer async gRPC variants or run in executor

  **Blocking database calls — use async drivers:**
  - `psycopg2` (PostgreSQL) → use `asyncpg` or `psycopg3` async
  - `pymysql` / `mysql.connector` (MySQL) → use `aiomysql`
  - `pymongo` (MongoDB) → use `motor` (async MongoDB driver)
  - `redis.StrictRedis` / `redis.Redis` → use `aioredis` or `redis.asyncio`
  - `pyodbc` (ODBC/SQL Server) → run in `asyncio.get_event_loop().run_in_executor(None, ...)`
    since there is no native async ODBC driver; alternatively switch to `aioodbc`

  **Blocking sleep and I/O:**
  - `time.sleep(n)` → use `await asyncio.sleep(n)`
  - Synchronous file I/O (`open()`, `os.read()`) → use `aiofiles` or offload to executor

  If you must call a blocking library from an async handler, wrap it with:
  ```python
  loop = asyncio.get_event_loop()
  result = await loop.run_in_executor(None, blocking_function, arg1, arg2)
  ```

- RULE AF103 [warning]: Do not catch bare `Exception` and silently `pass` or log without
  re-raising. Swallowing exceptions prevents Azure Functions from marking the invocation
  as failed and hides errors from Application Insights.

  Bad:
  ```python
  except Exception:
      pass
  ```
  Good:
  ```python
  except Exception:
      logging.exception("Unexpected error")
      raise
  ```

- RULE AF104 [info]: HTTP trigger functions should return an explicit `status_code`.
  Omitting it defaults to 200, which can mask errors when the function returns early.

- RULE AF105 [warning]: Timer-triggered functions should be idempotent. Verify the logic
  handles duplicate or missed executions (e.g. due to host restart) without corrupting
  state or duplicating work.

- RULE AF106 [info]: Use structured logging (`logging.info`, `logging.warning`, etc.)
  rather than `print()`. Output to stdout via `print()` is not captured by Application
  Insights and will be lost in production.

- RULE AF107 [warning]: Avoid importing heavy libraries (`pandas`, `numpy`, `torch`,
  `scipy`) at the top level if they are used only in one function. Cold-start time is
  proportional to total import time. Use lazy imports inside the handler or split into
  separate function apps.

- RULE AF108 [warning]: Avoid loading large datasets, ML models, or large binary files
  entirely into memory on each invocation. Azure Functions Consumption plan workers are
  killed with signal 137 (SIGKILL / OOM) when memory limits are exceeded. Load large
  resources at module scope (once per worker lifetime) or use streaming reads. If memory
  requirements consistently exceed plan limits, move to a Premium or Dedicated plan with
  larger memory SKUs.

- RULE AF109 [warning]: `pyodbc` connections must not be opened at module scope without
  proper connection pooling guards. Opening multiple connections concurrently from the
  same worker process can cause connection collisions and process crashes (signal 139 /
  SIGSEGV). Use a thread-local connection pattern or a connection pool, and ensure
  connections are closed/returned after each invocation.

  Example of a thread-safe pattern:
  ```python
  import threading
  _local = threading.local()

  def get_conn():
      if not hasattr(_local, 'conn') or _local.conn is None:
          _local.conn = pyodbc.connect(CONNECTION_STRING, autocommit=True)
      return _local.conn
  ```

---

## Dependency & Packaging Rules

- RULE AF110 [error]: `requirements.txt` or `uv.lock` must be present in the project
  root. Azure Functions uses it to install dependencies during deployment. If it is
  missing, imports will fail in the cloud even if they work locally.

- RULE AF111 [warning]: Pin dependency versions in `requirements.txt`
  (e.g. `azure-functions==1.21.0`) rather than leaving them unpinned (`azure-functions`)
  or using broad ranges. Unpinned dependencies can break deployments when a new version
  introduces breaking changes or, in the worst case, cause process crashes (signal 139 /
  SIGSEGV) from ABI-incompatible native extensions.

- RULE AF112 [warning]: Only flag this rule when `azure-functions` is pinned to a
  version **older than `1.17.0`** (e.g. `azure-functions==1.14.0`). If the package is
  unpinned (e.g. `azure-functions` with no version) or pinned to `1.17.0` or later, it
  is valid — do NOT report a finding. Versions before `1.17.0` lack full v2 programming
  model support and important bug fixes.

- RULE AF113 [warning]: Do not generate `requirements.txt` using `pip freeze` output
  directly. `pip freeze` captures every installed package in your local environment
  (including OS-specific compiled packages) and may include packages that do not have
  Linux-compatible wheels. This causes `ModuleNotFoundError` during deployment because
  Azure Functions Linux workers cannot install Windows-only `.whl` files. Instead,
  maintain a minimal `requirements.txt` with only direct dependencies, or use
  `pip-compile` (pip-tools) against a clean Linux virtual environment.

- RULE AF114 [warning]: Verify that all packages in `requirements.txt` have
  Linux-compatible wheels available on PyPI (i.e. `manylinux` or pure-Python wheels).
  Packages that only ship Windows `.whl` files (e.g. some Windows-specific ODBC drivers,
  `pywin32`) will fail to install on Azure Functions Linux workers with a
  `ModuleNotFoundError`. Check PyPI for `linux` wheel availability before adding a
  package, or use the remote build option (`scmDoBuildDuringDeployment: true`) to build
  on a Linux host.

- RULE AF115 [info]: For Python projects deployed to Linux Function Apps, enable remote
  build by setting `"azureFunctions.scmDoBuildDuringDeployment": true` in VS Code
  settings and `"SCM_DO_BUILD_DURING_DEPLOYMENT": "1"` in application settings. Remote
  build runs `pip install` on the Linux server, which correctly resolves Linux-compatible
  wheels and avoids cross-platform dependency issues that arise from local Windows builds.
