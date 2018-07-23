# Breaking changes to JavaScript Debug Configuration

The debug configuration for v2 of the Azure Functions runtime [has changed](https://github.com/Azure/azure-functions-core-tools/issues/521) and old configurations will likely fail with the error "Cannot connect to runtime process, timeout after 10000 ms". You will automatically be prompted to update your configuration when you open a project. However, you can manually update your project with one of the following options:

The first option is to add the following to your `runFunctionsHost` task in `.vscode\tasks.json`:

```json
{
    "options": {
        "env": {
            "languageWorkers:node:arguments": "--inspect=5858"
        }
    }
}
```

The second option requires two steps:

1. Edit your `runFunctionsHost` task in `.vscode\tasks.json` so that `command` is `func host start --language-worker -- \"--inspect=5858\"` instead of just `func host start`
1. Add `"FUNCTIONS_WORKER_RUNTIME": "node"` to your `local.settings.json` file

The recommended debug configuration going forward has not been finalized. It will likely be similar to Option 2, but without a change to `local.settings.json` (since that file is not tracked by git). See [here](https://github.com/Azure/azure-functions-host/issues/3120) for more information.
