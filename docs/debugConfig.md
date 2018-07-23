# Breaking changes to JavaScript Debug Configuration

The debug configuration for v2 of the Azure Functions runtime [has changed](https://github.com/Azure/azure-functions-core-tools/issues/521) and old configurations will likely fail with the error "Cannot connect to runtime process, timeout after 10000 ms". You will automatically be prompted to update your configuration when you open a project. However, you can manually update your project with one of the following options:

The first option is to add `languageWorkers:node:arguments` to your `runFunctionsHost` task in `.vscode\tasks.json` as seen below:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Run Functions Host",
      "identifier": "runFunctionsHost",
      "type": "shell",
      "command": "func host start",
      "options": {
        "env": {
          "languageWorkers:node:arguments": "--inspect=5858"
        }
      },
      "isBackground": true,
      "presentation": {
        "reveal": "always"
      },
      "problemMatcher": [
        {
          "owner": "azureFunctions",
          "pattern": [
            {
              "regexp": "\\b\\B",
              "file": 1,
              "location": 2,
              "message": 3
            }
          ],
          "background": {
            "activeOnStart": true,
            "beginsPattern": "^.*Stopping host.*",
            "endsPattern": "^.*Job host started.*"
          }
        }
      ]
    }
  ]
}
```

The second option requires two steps:

1. Pass the `--language-worker` parameter to `func host start` in your `runFunctionsHost` task in `.vscode\tasks.json` as seen below:
    ```json
    {
    "version": "2.0.0",
    "tasks": [
        {
        "label": "Run Functions Host",
        "identifier": "runFunctionsHost",
        "type": "shell",
        "command": "func host start --language-worker -- \"--inspect=5858\"",
        "isBackground": true,
        "presentation": {
            "reveal": "always"
        },
        "problemMatcher": [
            {
            "owner": "azureFunctions",
            "pattern": [
                {
                "regexp": "\\b\\B",
                "file": 1,
                "location": 2,
                "message": 3
                }
            ],
            "background": {
                "activeOnStart": true,
                "beginsPattern": "^.*Stopping host.*",
                "endsPattern": "^.*Job host started.*"
            }
            }
        ]
        }
    ]
    }
    ```

1. Add the `FUNCTIONS_WORKER_RUNTIME` setting to your `local.settings.json`:

    ```json
    {
      "IsEncrypted": false,
      "Values": {
          "AzureWebJobsStorage": "",
          "FUNCTIONS_WORKER_RUNTIME": "node"
      }
    }
    ```

The recommended debug configuration going forward has not been finalized. It will likely be similar to Option 2, but without a change to `local.settings.json` (since that file is not tracked by git). See [here](https://github.com/Azure/azure-functions-host/issues/3120) for more information.
