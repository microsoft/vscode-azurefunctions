# .NET Template JSON CLI

[![Build Status](https://devdiv.visualstudio.com/DevDiv/_apis/build/status/Azure%20Tools/vscode-azurefunctions-jsoncli?branchName=main)](https://devdiv.visualstudio.com/DevDiv/_build/latest?definitionId=13600&branchName=main)

This tool is leveraged by the Functions extension at the root of this repo. It provides a JSON-based way to interact with .NET Templates. It also allows us to use templates directly from a nuget package, rather than forcing the user to install the templates machine-wide.

## Prerequisites

[.NET CLI](https://docs.microsoft.com/dotnet/core/tools/?tabs=netcore2x)

## Example Usage

### List

```bash
dotnet --require ./projectTemplates-~2.nupkg --require ./itemTemplates-~2.nupkg --operation list
```

This will list all templates included in the NuGet packages specified with the `require` parameter. Multiple packages can be specified in the format of a disk path, a NuGet package ID, or a NuGet package ID and version formatted as `{id}::{version}`. Example output:

```json
[
    {
        "Author": "Microsoft",
        "Classifications": [
            "Azure Function"
        ],
        "DefaultName": "TimerTriggerCSharp",
        "Identity": "Azure.Function.CSharp.TimerTrigger.1.x",
        "GroupIdentity": "Azure.Function.TimerTrigger",
        "Name": "TimerTrigger",
        "ShortName": "Timer",
        "Parameters": [
            {
                "Documentation": "Enter a cron expression of the format '{second} {minute} {hour} {day} {month} {day of week}' to specify the schedule.",
                "Name": "Schedule",
                "Priority": 0,
                "Type": null,
                "IsName": false,
                "DefaultValue": "0 */5 * * * *",
                "DataType": null,
                "Choices": null
            }
        ]
    }
]
```

### Create

```bash
dotnet --require projectTemplates-~2.nupkg --require itemTemplates-~2.nupkg --operation create --identity Azure.Function.CSharp.TimerTrigger.1.x --arg:name TimerTriggerCSharp1 --arg:namespace Company.Function --arg:Schedule "0 */5 * * * *"
```

This will create the template with the specified identity. The `require` parameter is the same as used above. The `identity` and `arg` parameters can be retrieved from the result of a list operation, shown above. The `name` and `namespace` args apply to all templates.

## Contributing

In order to work on this tool, make sure to install the [VS Code Debugger for C#](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csharp). You must also make sure to open the `JsonCli` folder _and only_ the `JsonCli` folder in VS Code. The source code has been excluded from VS Code when the root of this repo is open so that it doesn't display a bunch of warnings/errors/notifications while working on the extension itself.

### Debug

1. When prompted, make sure to restore NuGet packages
1. Ensure the latest .NET templates are downloaded. The easiest way is to F5 the extension at the root of this repo and open the Functions explorer to make sure the extension is activated. This will automatically download the latest NuGet packages to `resources/dotnetTemplates/`.
1. From the debug window, select either the 'create template' or 'list templates' option based on what you want to test
1. Start debugging!

### Publish

In order to update the dll's shipped with the extension, you need to run a 'publish':

1. Select 'Run Task' from the command palette
1. Select 'publish'
1. Commit changes
