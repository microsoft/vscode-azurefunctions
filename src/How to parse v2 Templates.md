How to parse v2 Templates

After getting the urls, we have
- userPrompts which are shaped like this:
{
  id: "httpTrigger-route",
  name: "httpTrigger-route",
  label: "$httpTrigger_route_label",
  help: "$httpTrigger_route_help",
}

First, we need to replace the name, label, and help with their values from the resources file.
So, the rawUserPrompts should be combined with the resources to create IUserPrompts.

Then, each raw template has a "jobs" array. These will be presented to users as potential actions that they can take with this template.
    Each job has a "actions" array. These are the actions that VS Code must interpret and execute.
    Each job also has an "inputs" array. These are similar to bindings. The "paramId" correlates with the "id" property of userPrompt. userPrompt provides the input with a name, label, help, some have validators and quite a few other properties.
    The input has the useful information such as defaultValue, required, assignTo token, and more.

Then IUserPrompts will be used with create IJobs. IJobs will be attached to the parsed templates (whatever that ends up being). The idea is that we never have to refer to the raw templates and correlate the ids again.
We will attach _all_ the data we need for project creation to the parsed templates.

Actions and Inputs are indepedent from each other. Inputs are the equivalent of "promptSteps" and actions are "executeSteps"

In FunctionSubWizard, there is an "addBindingSteps". This is the equivalent of adding "promptSteps" based on the user scenario.
For V2, we should skip this and present the user a choice of actions to take. The actions will be based on the "jobs" array of the parsed templates.

Maybe something like this?
JobsPromptStep
    - This will present the user with a list of jobs to choose from
    - The user will select a job and then we will create the appropriate promptSteps and executeSteps based on the job's actions and inputs
    - The user will then be presented with the promptSteps and executeSteps via the subWizard

Should I change FunctionSubWizard to add this or make a new file?
Could probably extend FunctionListStep for a v2 version as well.
