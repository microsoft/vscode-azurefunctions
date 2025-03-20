## How the extension parses Templates V2

### Bundle feed

The templates come from the extension [bundle feed](https://cdn.functions.azure.com/public/ExtensionBundles/Microsoft.Azure.Functions.ExtensionBundle/index-v2.json) under the `templates.v2` property.
The extension looks at the `bundleVersions` to determine what the latest version is. It then uses the three properties `functions`, `userPrompts`, and `resources` to retrieve the jsons used to parse the templates.

**NOTE: For v1, we use `bindings` instead of `userPrompts`**

### Functions
This .json file contains all of the actions, jobs, and content of the template triggers. Each function template contain the following JSON objects:

`jobs`: Contains the different scenarios that the template can be used. An example of a `job` is "Add BlobTrigger function to the main file".
<br>Each job has an `actions` array. These are the actions that VS Code must interpret and execute.
<br>Each job also has an `inputs` array. These are similar to bindings. The "paramId" correlates with the "id" property of userPrompt.

`actions`: The template itself has an `actions` array that is different from the `jobs.actions` array.
<br>It contains _all_ the actions that could be used by the template. Note that not every action is used by every job.

`files`: Contains an object where the key is the file name and the value is the content.

### UserPrompts
The `userPrompts.json` are used with by the templates to know what strings to display to the user when retrieving input.
The userPrompts are shaped like this:
{
  id: "httpTrigger-route",
  name: "httpTrigger-route",
  label: "$httpTrigger_route_label",
  help: "$httpTrigger_route_help",
}

The userPrompts must be combined with the resource files to get the localized strings.
It provides the input with a name, label, help, some have validators and quite a few other properties.
The input contains information such as defaultValue, required, assignTo token, and more.

### Resources
The `resources.json` comes in many languages. The extension will use the user's locale to determine which resource file to use.

In order to make the userPrompts human readable, we replace `name`, `label`, and `help` with the localized resources file string values.

### How the extension parses the templates
Any resource from the bundle feed that we have not altered in anyway is referred to as a "raw" resource.

For example, `rawUserPrompts` are combined with the resources to create `UserPrompts` objects.

Each `RawTemplateV2` has a `jobs` array. These are presented to users as potential actions that they can take with this template.

Then `UserPrompts` will be used with create `Jobs`. `Jobs` will be attached to the `FunctionV2Template`. `FunctionV2Templates` should encapsulate all of the data such that no raw resource should have to be referenced to again.

### Actions and Inputs

Actions and Inputs are indepedent from each other. Inputs are the equivalent of "promptSteps" and actions are "executeSteps"

In `FunctionSubWizard`, there is an "addBindingSteps". This is the equivalent of adding "promptSteps" based on the user scenario.
For V2, we present the user a choice of actions to take. The actions are based on the `jobs` array of the parsed templates and based off of that, it will push `promptSteps` and `executeSteps` to create an `AzureWizard`
