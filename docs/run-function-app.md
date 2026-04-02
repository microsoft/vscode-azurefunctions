# Run Function App

## Overview

The **Run Function App** command (`azureFunctions.runFunctionApp`) launches the Azure Functions host locally via `func start`. For Python projects it also ensures a virtual environment exists and dependencies are installed before starting.

---

## Source

`src/commands/runFunctionApp/RunFunctionApp.ts`

---

## Flow

### Python projects

1. Resolve project root (explicit URI → active editor workspace → first workspace folder). Requires `host.json` to confirm it is a Functions project.
2. Detect runtime from `local.settings.json` (`FUNCTIONS_WORKER_RUNTIME == python`).
3. If `.venv` does not exist, find a Python 3 interpreter (`python3` / `python` / `py`) and create the venv with `python -m venv .venv`.
4. If `requirements.txt` exists, run `pip install -r requirements.txt` inside the venv.
5. Open the **Azure Functions: Run** terminal with the venv environment pre-applied and send `func start`.

### All other runtimes

Opens the **Azure Functions: Run** terminal and sends `func start` directly.

---

## Python venv activation approach

Activation and `func start` are sent as **two separate `terminal.sendText` calls** with a 1.5-second pause:

1. **Immediate:** activation command only.

| Shell | Activation command |
|---|---|
| PowerShell / pwsh | `& "<venv>\Scripts\Activate.ps1"` |
| bash / zsh | `source "<venv>/bin/activate"` |
| cmd.exe | `"<venv>\Scripts\activate.bat"` |

2. **After 1.5 s:** `func start`

### Why two steps with a pause?

`func start` works correctly when the terminal's venv is **already active** before the command runs. In a freshly-created terminal two things happen concurrently:

- Our activation script runs
- VS Code's Python extension auto-sends its own `& Activate.ps1` to every new terminal it detects

When both activations collide with `func start` starting up, the Python worker fails to initialize and exits immediately.

The 1.5-second pause lets both activations finish and the input buffer drain before `func start` is sent — replicating the settled state of an already-activated terminal.

---

## Entry points

| Surface | Condition |
|---|---|
| Editor title bar button (`▶`) | Always visible when a file is open |
| Command Palette | `Azure Functions: Run Function App` |

---

## Telemetry

| Property | Value |
|---|---|
| `runtime` | Detected worker runtime (e.g. `python`) |
| `pythonAlias` | Python binary used to create venv (`python3`, `python`, `py`) |
| `venvAlreadyExisted` | `"true"` if `.venv` was already present |
| `startCommand` | `"func start (python)"` or `"func start"` |
