# Azure Function Templates

The code in this folder is used to parse and model the [function templates](https://github.com/Azure/azure-webjobs-sdk-templates) provided by the [Azure Functions CLI Feed](https://aka.ms/funcCliFeedV4). The Functions CLI Feed provides a central location to get the latest version of all templates used for functions.

## Template Sources

Templates are retrieved from the following sources, in order:
1. VS Code extension cache, if the cached version matches the latest version from the CLI Feed
1. Latest templates from the CLI Feed
1. VS Code extension cache, if we fail to get the latest templates or it times out
1. Backup templates stored in `resources/backupTemplates`, if we fail to get the latest templates and the cache is empty

Unit test run separately against all of these template sources (cache, latest, backup) in addition to "staging", which is the pre-production version of "latest". Different template sources can be tested manually with the "azureFunctions.templateSource" setting.

### Updating Backup Templates

Backup templates should be updated every time there is a major change in the latest templates, and otherwise periodically with the release of the extension. In order to update:
1. Modify `AZFUNC_UPDATE_BACKUP_TEMPLATES` to `1` in `.vscode/launch.json`
1. Select "Launch Tests" as the debug configuration
1. F5 the extension
1. Commit changes

> NOTE: This tool was written as a "test" so that it can run in the context of VS Code and our extension. This allows the "backup template" code to be much more tightly integrated with the core templates code, as opposed to something like a gulp task which would have to be completely separate.

## Script Templates

Basic script templates (i.e. http and timer) are retrieved from the 'templates' property in each entry of the [CLI Feed](https://aka.ms/funcCliFeedV4). More advanced templates (i.e. blob and cosmos) are retrieved from another feed specific to the extension bundle for that project. For example, the default bundle is 'Microsoft.Azure.Functions.ExtensionBundle' and the matching feed is https://cdn.functions.azure.com/public/ExtensionBundles/Microsoft.Azure.Functions.ExtensionBundle/index-v2.json

> NOTE: Both template feeds support 'staging' environments for us to test against before moving to production. The main CLI Feed uses a "vX-prerelease" tag, while the bundle feed has a completely different url leveraging "cdn-staging.functions.azure.com" instead of "cdn.functions.azure.com ".

In both cases, the templates are split into three parts: templates.json, bindings.json, and resources.json. See below for an example of the schema for the TimerTrigger template:

<details>
<summary>templates.json</summary>

```json
[
    {
        "id": "TimerTrigger-JavaScript",
        "function": {
            "disabled": false,
            "bindings": [
                {
                    "name": "myTimer",
                    "type": "timerTrigger",
                    "direction": "in",
                    "schedule": "0 */5 * * * *"
                }
            ]
        },
        "metadata": {
            "defaultFunctionName": "TimerTriggerJS",
            "description": "$TimerTriggerNodeJS_description",
            "name": "TimerTrigger",
            "language": "JavaScript",
            "category": [
                "$temp_category_core",
                "$temp_category_dataProcessing"
            ],
            "enabledInTryMode": true,
            "userPrompt": [
                "schedule"
            ]
        },
        "files": {
            "index.js": "module.exports = function (context, myTimer) {\n    var timeStamp = new Date().toISOString();\n    \n    if(myTimer.isPastDue)\n    {\n        context.log('JavaScript is running late!');\n    }\n    context.log('JavaScript timer trigger function ran!', timeStamp);   \n    \n    context.done();\n};",
            "readme.md": "# TimerTrigger - JavaScript\n\nThe `TimerTrigger` makes it incredibly easy to have your functions executed on a schedule. This sample demonstrates a simple use case of calling your function every 5 minutes.\n\n## How it works\n\nFor a `TimerTrigger` to work, you provide a schedule in the form of a [cron expression](https://en.wikipedia.org/wiki/Cron#CRON_expression)(See the link for full details). A cron expression is a string with 6 separate expressions which represent a given schedule via patterns. The pattern we use to represent every 5 minutes is `0 */5 * * * *`. This, in plain text, means: \"When seconds is equal to 0, minutes is divisible by 5, for any hour, day of the month, month, day of the week, or year\".\n\n## Learn more\n\n<TODO> Documentation",
            "sample.dat": ""
        },
        "runtime": "default"
    }
]
```

</details>

<details>
<summary>bindings.json</summary>

```json
{
    "$schema": "<TBD>",
    "contentVersion": "2016-03-04-alpha",
    "variables": {
        "parameterName": "$variables_parameterName"
    },
    "bindings": [
        {
            "type": "timerTrigger",
            "displayName": "$timerTrigger_displayName",
            "direction": "trigger",
            "enabledInTryMode": true,
            "documentation": "## Settings for timer trigger\n\nThe settings provide a schedule expression. For example, the following schedule runs the function every minute:\n\n - `schedule`: Cron tab expression which defines schedule \n - `name`: The variable name used in function code for the TimerTrigger. \n - `type`: must be *timerTrigger*\n - `direction`: must be *in*\n\nThe timer trigger handles multi-instance scale-out automatically: only a single instance of a particular timer function will be running across all instances.\n\n## Format of schedule expression\n\nThe schedule expression is a [CRON expression](http://en.wikipedia.org/wiki/Cron#CRON_expression) that includes 6 fields:  `{second} {minute} {hour} {day} {month} {day of the week}`. \n\nNote that many of the cron expressions you find online omit the {second} field, so if you copy from one of those you'll have to adjust for the extra field. \n\nHere are some other schedule expression examples:\n\nTo trigger once every 5 minutes:\n\n```json\n\"schedule\": \"0 */5 * * * *\"\n```\n\nTo trigger once at the top of every hour:\n\n```json\n\"schedule\": \"0 0 * * * *\",\n```\n\nTo trigger once every two hours:\n\n```json\n\"schedule\": \"0 0 */2 * * *\",\n```\n\nTo trigger once every hour from 9 AM to 5 PM:\n\n```json\n\"schedule\": \"0 0 9-17 * * *\",\n```\n\nTo trigger At 9:30 AM every day:\n\n```json\n\"schedule\": \"0 30 9 * * *\",\n```\n\nTo trigger At 9:30 AM every weekday:\n\n```json\n\"schedule\": \"0 30 9 * * 1-5\",\n```\n\n## Timer trigger C# code example\n\nThis C# code example writes a single log each time the function is triggered.\n\n```csharp\npublic static void Run(TimerInfo myTimer, TraceWriter log)\n{\n    log.Info($\"C# Timer trigger function executed at: {DateTime.Now}\");    \n}\n```\n\n## Timer trigger JavaScript example\n\n```JavaScript\nmodule.exports = function(context, myTimer) {\n    if(myTimer.isPastDue)\n    {\n        context.log('JavaScript is running late!');\n    }\n    context.log(\"Timer last triggered at \" + myTimer.last);\n    context.log(\"Timer triggered at \" + myTimer.next);\n    \n    context.done();\n}\n```",
            "settings": [
                {
                    "name": "name",
                    "value": "string",
                    "defaultValue": "myTimer",
                    "required": true,
                    "label": "$timerTrigger_name_label",
                    "help": "$timerTrigger_name_help",
                    "validators": [
                        {
                            "expression": "^[a-zA-Z][a-zA-Z0-9]{0,127}$",
                            "errorText": "[variables('parameterName')]"
                        }
                    ]
                },
                {
                    "name": "schedule",
                    "value": "string",
                    "defaultValue": "0 * * * * *",
                    "required": true,
                    "label": "$timerTrigger_schedule_label",
                    "help": "$timerTrigger_schedule_help",
                    "validators": [
                        {
                            "expression": "^(\\*|((([1-5]\\d)|\\d)(\\-(([1-5]\\d)|\\d)(\\/\\d+)?)?)(,((([1-5]\\d)|\\d)(\\-(([1-5]\\d)|\\d)(\\/\\d+)?)?))*)(\\/\\d+)? (\\*|((([1-5]\\d)|\\d)(\\-(([1-5]\\d)|\\d)(\\/\\d+)?)?)(,((([1-5]\\d)|\\d)(\\-(([1-5]\\d)|\\d)(\\/\\d+)?)?))*)(\\/\\d+)? (\\*|(((1\\d)|(2[0-3])|\\d)(\\-((1\\d)|(2[0-3])|\\d)(\\/\\d+)?)?)(,(((1\\d)|(2[0-3])|\\d)(\\-((1\\d)|(2[0-3])|\\d)(\\/\\d+)?)?))*)(\\/\\d+)? (\\*|((([1-2]\\d)|(3[0-1])|[1-9])(\\-(([1-2]\\d)|(3[0-1])|[1-9])(\\/\\d+)?)?)(,((([1-2]\\d)|(3[0-1])|[1-9])(\\-(([1-2]\\d)|(3[0-1])|[1-9])(\\/\\d+)?)?))*)(\\/\\d+)? (\\*|(([A-Za-z]+|(1[0-2])|[1-9])(\\-([A-Za-z]+|(1[0-2])|[1-9])(\\/\\d+)?)?)(,(([A-Za-z]+|(1[0-2])|[1-9])(\\-([A-Za-z]+|(1[0-2])|[1-9])(\\/\\d+)?)?))*)(\\/\\d+)? (\\*|(([A-Za-z]+|[0-6])(\\-([A-Za-z]+|[0-6])(\\/\\d+)?)?)(,(([A-Za-z]+|[0-6])(\\-([A-Za-z]+|[0-6])(\\/\\d+)?)?))*)(\\/\\d+)?$",
                            "errorText": "$timerTrigger_schedule_errorText"
                        }
                    ]
                }
            ]
        }
    ]
}
```

</details>

<details>
<summary>resources.json</summary>

```json
{
    "lang": {},
    "en": {
        "temp_category_core": "Core",
        "temp_category_dataProcessing": "Data Processing",
        "timerTrigger_displayName": "Timer",
        "timerTrigger_name_help": "The name used to identify this trigger in your code",
        "timerTrigger_name_label": "Timestamp parameter name",
        "timerTrigger_schedule_help": "Enter a cron expression of the format '{second} {minute} {hour} {day} {month} {day of week}' to specify the schedule. See documentation below for examples.",
        "timerTrigger_schedule_label": "Schedule",
        "TimerTriggerNodeJS_description": "A JavaScript function that will be run on a specified schedule",
        "timerTrigger_schedule_errorText": "Invalid Cron Expression. Please consult the <a target='_blank' href='https://azure.microsoft.com/en-us/documentation/articles/functions-bindings-timer/'>documentation</a> to learn more.",
        "variables_parameterName": "The parameter name must be an alphanumeric string of any number of characters and cannot start with a number."
    }
}
```

</details>

## .NET Templates

.NET templates are retrieved from the 'itemTemplates' and 'projectTemplates' properties in the CLI Feed. A single version of the Azure Functions runtime might support multiple versions of the .NET runtime, so we use the target framework and sdk from a user's `*.csproj` file to pick the matching templates. We then leverage the JsonCLI tool ('Microsoft.TemplateEngine.JsonCli') which provides a JSON-based way to interact with .NET templates. More information on that tool can be found in the [tools/JsonCli](https://github.com/microsoft/vscode-azurefunctions/tree/main/tools/JsonCli) folder at the root of this repo.
