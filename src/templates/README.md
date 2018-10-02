# Azure Function Templates

The code in this folder is used to parse and model the [function templates](https://github.com/Azure/azure-webjobs-sdk-templates) provided by the [Azure Functions CLI Feed](https://aka.ms/V00v5v). The Functions CLI Feed provides a central location to get the latest version of all templates used for functions. Currently, this repo leverages the following templates:

* [Script Templates](#script-templates) (i.e. JavaScript, C#Script, and Python)
* [.NET Templates](#.net-templates) (i.e. C#)

## Script Templates

Script templates are retrieved from the 'templateApiZip' property in the CLI Feed. The zip contains data in three parts: templates.json, bindingconfig.json, and resources.json. See below for an example of the schema for the TimerTrigger template:

### Templates.json

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

### BindingConfig.json

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

### Resources.json

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

## .NET Templates

.NET templates are retrieved from the 'itemTemplates' and 'projectTemplates' properties in the CLI Feed. These properties reference two nuget packages. We then leverage the 'Microsoft.TemplateEngine.JsonCli' dll which provides a JSON-based way to interact with .NET templates.

The following is an example command used to list templates:

```
dotnet <path to extension>/resources/dotnetJsonCli/Microsoft.TemplateEngine.JsonCli.dll --require <path to extension>/resources/dotnetTemplates/itemTemplates-~1.nupkg --require <path to extension>/resources/dotnetTemplates/projectTemplates-~1.nupkg --operation list
```

Example format for the Timer Trigger:

```json
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
```

And the following is an example command for creating a template:

```
dotnet <path to extension>/resources/dotnetJsonCli/Microsoft.TemplateEngine.JsonCli.dll --require <path to extension>/resources/dotnetTemplates/itemTemplates-~2.nupkg --require <path to extension>/resources/dotnetTemplates/projectTemplates-~2.nupkg --operation create --identity Azure.Function.CSharp.TimerTrigger.2.x --arg:Schedule 0 */5 * * * * --arg:name TimerTriggerCSharp --arg:namespace Company.Function
```
