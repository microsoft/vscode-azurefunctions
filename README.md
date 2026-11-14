# Azure Functions for Visual Studio Code

<!-- region exclude-from-marketplace -->

[![Build Status](https://dev.azure.com/devdiv/DevDiv/_apis/build/status%2FAzure%20Tools%2FVSCode%2FExtensions%2Fvscode-azurefunctions?repoName=microsoft%2Fvscode-azurefunctions&branchName=main)](https://dev.azure.com/devdiv/DevDiv/_build/latest?definitionId=20565&repoName=microsoft%2Fvscode-azurefunctions&branchName=main)

<!-- endregion exclude-from-marketplace -->

Use the Azure Functions extension to quickly create, debug, manage, and deploy serverless apps directly from VS Code.

**Visit the [wiki](https://github.com/Microsoft/vscode-azurefunctions/wiki) for more information about Azure Functions and how to use the advanced features of this extension.**

> Sign up today for your free Azure account and receive 12 months of free popular services, $200 free credit and 25+ always free services 👉 [Start Free](https://azure.microsoft.com/free/open-source).

## Create your first serverless app

1. Select **Create New Function Project...** in the Azure Workspace explorer or command palette.

1. In the template gallery, select an HTTP trigger template and your desired programming language.
1. Select a new, _empty_ folder to contain your project and create the project.
1. If the selected folder is not already open, select "Open in current window" to open it.

**Create New Function Project...** opens the template gallery, even when a Functions project is already open. Gallery-created projects are initialized for VS Code before opening, including their language, tasks, and debugging configuration. Their programming model is detected from the copied project rather than overridden by a global default.

**Create Function...** adds a function to an existing Functions project using the classic template feed, including projects created from the gallery. If no Functions project exists in the selected folder, it opens project creation.

To use the previous project creation wizard, select **Switch to classic** in the gallery banner. This saves the user setting `"azureFunctions.classicTemplateFeed": true` for future project creation. The classic wizard asks for a destination again rather than reusing the gallery's launch-time folder. Disable the setting to return to the gallery.

Select the banner's **Dismiss** (X) button to hide it permanently without switching to classic. To show it again, enable `"azureFunctions.showClassicTemplateFeedBanner"` in Settings.

## Create Connector Trigger functions

In the classic **Create New Project** flow, choose **Connector Trigger** for a C#, TypeScript v4, or Python v2 project. In the authoring webview, choose an Azure subscription and supported region, select one connector, then select one or more polling events and choose **Create functions**.

Creation installs Node dependencies and builds TypeScript projects, restores and builds C# projects, or installs Python requirements into the virtual environment selected during VS Code initialization. If Python virtual-environment creation is skipped, a warning explains that dependencies still need to be installed; no packages are installed globally. Installation and build failures leave the generated files in place and the picker available for retry, rather than reporting completion.

Each selected event creates a separate function with its own trigger-configuration setting. Setting names use letters, digits, and underscores, with numeric suffixes to avoid collisions, while function names retain supported operation names. Local settings include the project's worker runtime, including `dotnet-isolated` for C# isolated projects. Events can share a Connector Namespace and connection. Non-deprecated webhook events remain visible, but cannot be created yet. JavaScript continues to use the existing filtered Template Gallery.

Project creation records every selected event in the project's `.vscode/settings.json` under `azureFunctions.connectorTriggerEvents`:

```json
{
    "azureFunctions.connectorTriggerEvents": [
        { "connectorId": "office365", "operationId": "OnNewEmailV3" },
        { "connectorId": "office365", "operationId": "OnFlaggedEmailV4" }
    ]
}
```

The selection can also include an `azureContext` containing the subscription ID, tenant ID, cloud, region, and, when available, account ID. These identifiers are saved in `.vscode/settings.json`, which may be tracked by source control. Credentials and parameter values are not saved in this selection. Retries update the record while preserving unrelated settings and JSONC comments. F5 uses a single saved event to preselect the connector and event in setup.

Events are loaded from the selected connector's regional exported definition (`managedApis/<connector>?api-version=2022-09-01-preview&export=true`). Swagger trigger and notification extensions distinguish polling events from webhooks; deprecated and internal events are excluded.

Authoring only creates local project files; it does not provision Azure resources, authorize connections, or collect event parameters. Before running or deploying, configure each binding's actual `connection` and `triggerConfigName` settings, including `<connection>__pollingEndpoint`. Multi-event projects are configured one event at a time during F5 setup, and the sample templates' Azure provisioning hooks remain single-event examples rather than multi-event setup.

Use an empty destination folder. A retry with the same selection can complete a partial copy without overwriting existing files or local settings. VS Code initialization preserves customized launch configurations, tasks, settings, and JSONC comments while adding missing Functions entries and defaults without duplicates. Conflicting project files are reported before copying.

## Run the serverless app locally

This extension integrates with the [Azure Functions Core Tools](https://docs.microsoft.com/azure/azure-functions/functions-run-local) to let you run your project locally before publishing to Azure.

1. To start your project, press F5 or the "play" button

    ![debug](resources/readme/debug.png)

1. If you do not have the [Azure Functions Core Tools](https://aka.ms/Dqur4e) installed, you will be automatically prompted to install. Follow the specified instructions, or skip to the "Deploy" step if you would rather deploy without running locally.
    > TIP: The "Terminal" panel should pop up automatically and you know your project is running if you see output
1. Expand your _local project_ in the Azure Workspace explorer to copy your function's url

    ![debug2](resources/readme/copyFunctionUrl.png)

1. Navigate to a browser, paste the url, and append `?name=world`
    > TIP: Your url should look like this: `http://localhost:7071/api/HttpTrigger1?name=world`
1. A response of "Hello world" is returned in the browser and you know your function worked!
1. Select the "Detach" button to stop your project from running locally

    ![debug3](resources/readme/debug3.png)

### Configure a polling Connector Trigger

F5 discovers actual polling Connector Trigger bindings and their connection/Trigger Config setting keys. The project is the one containing the host task's working directory. Settings checks apply the current platform's `terminal.integrated.env` over the inherited environment, then the task's `options.env`; null terminal values remove inherited variables. If the host task runs outside a Functions project or its working directory cannot be resolved, Connector Trigger setup is skipped rather than configuring another project. Commented-out registrations and malformed `function.json` files elsewhere in the workspace are ignored. Projects whose effective settings are already configured skip setup, even without saved event metadata. When a project has multiple polling events with incomplete settings, setup configures them one at a time; an **Event trigger to configure** list at the top of the setup screen selects which event is being configured, and stopping before every event is configured shows a warning listing the events that will not run.

A newly created single-event project uses its `azureFunctions.connectorTriggerEvents` entry to preselect the authored connector and polling event. Choose **Configure**, then select the provisioning subscription and supported region. Projects without saved event metadata select the connector and event explicitly from the live API lists. Function registration names, `host.json`, and setting names are not used to guess canonical event IDs. Only the selected connector's event metadata is loaded; authoring does not authenticate a connection or load account-specific parameter choices.

Existing singular v1 entries in the folder's `azureFunctions.connectorTriggerProjects` setting remain supported, keyed by project-relative path (`"."` for the folder root), with only `version`, `connectorId`, and `operationId`. Invalid entries stop setup rather than guessing. User settings and shared `.code-workspace` settings do not supply project identities. F5 does not create an identity artifact or persist the selected subscription, region, connector/event association, parameters, or credentials in VS Code settings.

When F5 detects missing or invalid Connector Trigger runtime settings, a modal asks you to configure the trigger. Choose **Configure** to open setup, **Debug Anyway** to continue debugging without connector setup, or **Cancel** to stop debugging. The connector trigger still needs valid configuration to run; Debug Anyway does not save connector settings or dismiss the prompt on future runs. Projects with valid runtime settings skip this prompt.

The editable setup screen shows the connector/event, Azure scope, resource choices, and computed local-settings changes. Projects created from Connector templates save the authoring subscription and region in each event's optional `azureContext` in `azureFunctions.connectorTriggerEvents`. Account, tenant and cloud identifiers keep the default tied to the same Azure Resources context. Configure prepopulates these choices only when the matching authenticated subscription and supported region are still available; both remain editable, and setup still requires approval before provisioning. Older event settings without Azure context continue to require explicit scope selection.

The shared Subscription dropdown respects the Azure Resources subscription filter; choose **Show all subscriptions** or **Use filtered subscriptions** to switch lists, or type to search the current list. If the saved scope is unavailable or ambiguous, select a current subscription and region rather than using a guessed account or location. If no subscriptions are authenticated, choose **Sign in to Azure** from the dropdown. Select an existing or new Connector Namespace and connection; for new resources, edit the resource group, namespace, and connection names. Computed setting keys and value sources are read-only, existing values are hidden, and environment overrides are flagged.

Choose **Set up and authenticate** to approve provisioning and lock the resource choices. A progress banner and busy button appear immediately, with status updates during provisioning, browser authentication, parameter loading, and saving. Complete browser consent if needed. The same screen then unlocks the selected event's inputs from the connector API. Dynamic choices are loaded through that authenticated connection, not a local list. For folder pickers such as Outlook, use the arrow to browse children, select a folder, or go back to the previous folder. Changing a dependency clears and reloads its dependent choices.

Outlook address filters accept typed email addresses. Their built-in designer directory suggestions are not connector operations and do not require a separate Graph sign-in or lookup.

Failed dynamic lookups show an error instead of an empty choice list. Use **Reload choices** to retry before applying parameters.

Choose **Apply and continue** to send the selected IDs or paths, not their display labels, to the event's Trigger Config. Events with no inputs finish configuration after setup. Before approval, **Cancel setup** or closing the screen makes no connector changes. After approval, cancellation stops new work after any in-flight operation settles, keeps any resources already created, and does not apply unsubmitted parameter values. Cancel and restart debugging to change locked resource choices.

Setup writes the service-provided polling endpoint, Trigger Config reference, and approved local credential selection to `local.settings.json`, preserving unrelated settings, comments, and formatting. Unsaved/conflicting edits, encrypted settings, and conflicting environment overrides stop saving rather than overwriting them. Later F5 runs reuse valid runtime settings; cancelling parameter selection leaves existing Azure resources available for retry. Unsupported event metadata and unavailable required choices stop setup rather than substituting guessed values. Fix the connection access or event definition and retry F5.

For a new local developer configuration, setup runs in the existing DebugProvider predebug validation flow; it does not add a task. It requires preview extension bundle **4.50.0 or later**, including `Microsoft.Azure.Functions.Extensions.Connector` **1.0.0 or later**, Azure Identity with named-credential support, `Azure.Identity.Broker`, and the platform's native broker assets. Older bundles can contain broker libraries for other extensions while their Connector supports only webhooks; those libraries alone do not enable Poll delivery. F5 does not verify bundle or broker support before starting; if it is missing, the Functions host fails after launch. New script-language Connector projects set the supported bundle minimum automatically; the first F5 downloads the configured bundle if it is not cached, without clearing other cached versions. For existing projects, set the `host.json` extension bundle version range to `[4.50.0,5.0.0)` before retrying F5. Sign in through **Azure Resources / Microsoft Authentication** in the environment where the Functions host runs. The broker's account, tenant, and cloud must match the selected subscription before setup changes Azure resources or grants connection access. Explicit CLI and service-principal configurations are retained rather than silently replaced.

To run a new TypeScript Connector project, install **Node.js 24 or later**, Functions Core Tools v4, and Azurite, then use **Create New Project → New Create → Connectors**. Creation installs the compatible SDK dependencies, builds the selected functions, and includes Node.js types in `tsconfig.json`; neither generic nor specialized templates require manual package or runtime edits. Start debugging with F5, choose **Configure**, approve the resource/connection setup, and supply the event inputs. The existing emulator flow handles local host storage. For an RSS test, use a publicly reachable feed and publish a new item after setup; allow up to the connector's 30-minute polling interval and verify an invocation or breakpoint, not just host startup. Compiled .NET projects still need broker support in the host-side extension package, not just in their isolated worker.

This flow also writes `"AZURE_TOKEN_CREDENTIALS": "VisualStudioCodeCredential"` and the selected subscription's tenant as `<connection>__tenantId` to local settings, leaving the connection's `__credential` unset. The tenant pin supports guest accounts without rewriting Azure Resources' home-tenant authentication record or changing other connections' tenant settings. The credential selection affects **every default Azure credential chain in that Functions host process**, not just the Connector Trigger. It contains no token and does not require `az login`. Upload Local Settings excludes this local-only selection and its Connector tenant pin; deployed connectors retain their existing managed-identity settings. Office 365 mailbox consent and the developer's connection-level receive policy are separate authorizations.

An overriding `AzureWebJobs<connection>` or `ConnectionStrings` section, including connection-string environment prefixes, blocks VS Code identity setup before provisioning or access grants. This check covers local settings and the effective process, terminal, and task environment. Remove the conflicting section or retain an explicitly configured credential instead of selecting VS Code authentication.

## Deploy to Azure

1. Sign in to your Azure Account by clicking "Sign in to Azure..." in the Azure Resources explorer
    >  If you don't already have an Azure Account, click "Create a Free Azure Account"
1. Select the 'plus' button to open the "Create Resource" menu

    ![Create resource](resources/readme/deploy/createResource.png)

1. Choose "Create Function App in Azure..."

    ![Create Function App in Azure](resources/readme/deploy/createFunctionApp.png)

1. Enter a globally unique name for your Function App
1. If multiple versions of your language's runtime are supported (i.e. Node.js 10 and Node.js 12), select your desired version (the latest is recommended)
1. Select a location
1. Wait for your Function App to be created. Progress will be shown in the Activity Log panel

    ![deploy2](resources/readme/deploy/activityLog.png)

1. Once your Function App has been created, reveal the resource in the Resources view.

    ![Finished creating Function App](resources/readme/deploy/createComplete.png)

1. Right click your Function App and select "Deploy to Function App"

    ![Deploy to Function App](resources/readme/deploy/deploy.png)

1. Once deployment is complete, expand your _subscription_ in the Azure Resources explorer to copy your deployed function's url

    ![deploy3](resources/readme/deploy/copyFunctionUrl.png)

1. Navigate to a browser, paste the url, and append `?name=world`
    > TIP: Your url should look like this: `https://<function app name>.azurewebsites.net/api/HttpTrigger1?name=world`
1. A response of "Hello world" is returned in the browser and you know your function worked!

## Troubleshooting

### Gallery project initialization

Every gallery project is initialized for use with VS Code, regardless of language or whether the Function App is at the workspace root or in a subfolder such as `src`. Initialization configures the language-specific tasks, debugger, and settings for the Function App's location. Discovery uses only the destination's files and settings; if multiple Function Apps are found, the selected default is saved only in the new project's configuration. Confirm any task-overwrite prompt to replace the template's matching tasks; unrelated custom tasks and settings, including those in JSONC files, and parent-workspace configuration are preserved. For an existing project, run **Azure Functions: Initialize Project for Use with VS Code...** from the workspace root.

### Node.js MCP template SDK requirements

The Node.js v4 MCP Resource template requires `@azure/functions` 4.12.0 or later, and the MCP Prompt template requires 4.14.0 or later, for both JavaScript and TypeScript. Function creation checks the SDK installed in the project, not just the version range in `package.json`. If the SDK is missing or too old, creation stops before writing the function and displays the required version and an `npm install` command. Run that command in the project folder and retry. The extension does not upgrade dependencies automatically.

### "unable to get local issuer certificate" on a corporate network

If you're on a corporate network that performs HTTPS/SSL inspection (for example Zscaler, Netskope, Cisco Umbrella, or an internal certificate authority), Azure operations may fail with errors like `unable to get local issuer certificate` or `self-signed certificate in certificate chain`. This happens because the extension's Azure calls run in the Node.js extension host, which does not use the operating system certificate store by default.

To resolve it, point Node.js and VS Code at your corporate root CA (typically by setting `NODE_EXTRA_CA_CERTS`). See the [certificate troubleshooting guide in the Azure Resources extension README](https://github.com/microsoft/vscode-azureresourcegroups/blob/main/README.md#unable-to-get-local-issuer-certificate-on-a-corporate-network) for the full steps.

<!-- region exclude-from-marketplace -->

## Contributing

There are a couple of ways you can contribute to this repo:

* **Ideas, feature requests and bugs**: We are open to all ideas and we want to get rid of bugs! Use the Issues section to either report a new issue, provide your ideas or contribute to existing threads.
* **Documentation**: Found a typo or strangely worded sentences? Submit a PR!
* **Code**: Contribute bug fixes, features or design changes:
  * Clone the repository locally and open in VS Code.
  * Run "Extensions: Show Recommended Extensions" from the [command palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) and install all extensions listed under "Workspace Recommendations"
  * Open the terminal (press <kbd>CTRL</kbd>+ <kbd>\`</kbd>) and run `npm install`.
  * To build, press <kbd>F1</kbd> and type in `Tasks: Run Build Task`.
  * Debug: press <kbd>F5</kbd> to start debugging the extension.

### Creation and deployment workflow telemetry

This integration uses the published `@microsoft/vscode-azext-utils` 5.1.0 and `@microsoft/vscode-azext-azureappservice` 6.1.0 workflow telemetry APIs from [microsoft/vscode-azuretools#2418](https://github.com/microsoft/vscode-azuretools/pull/2418) and [microsoft/vscode-azuretools#2426](https://github.com/microsoft/vscode-azuretools/pull/2426).

The root events are `azureFunctions.createNewProject`, `azureFunctions.createNewProjectWithDockerfile`, `azureFunctions.templateGallery.createProject`, `azureFunctions.deploy`, `azureFunctions.deployProject`, `azureFunctions.deploySlot`, `azureFunctions.redeploy`, and `azureFunctions.deployByFunctionAppId`. The additive shared schema (`workflowSchemaVersion=1`) identifies the bounded `workflow` and `command`, generated `workflowRunId` and `attemptId`, `isWorkflowRoot`, and observed `stage`/`outcome`. Nested actions have a `parentAttemptId`; deployment stages and real retries are not additional user workflows. Registered literal step identities are independent of wizard runtime UUIDs. Unregistered template-supplied step names remain `unknown`.

Use normalized `outcome`, not the legacy `result`, to distinguish `handedOff` to the gallery, `blocked` on an unavailable prerequisite, genuine `canceled` dismissal, and `failed` pre-deploy tasks. Legacy cancellation control flow is preserved. Gallery launch is not completed project creation, and cannot execute classic creation steps. A failed task followed by "Deploy Anyway" remains a failed task stage, not a failed deployment by itself. Deployment mechanism/status and bounded failure categories distinguish task, CLI, transport, and deployment failures without recording raw messages, output, paths, URLs, resource names, or resource identifiers in the new fields.

For creation-outcome denominators, select `workflow=createProject` and `isWorkflowRoot=true`, exclude `outcome=handedOff`, and exclude started/child/stage records. The explicit gallery Create button starts its own root; its internal operations join that root. Measure launcher engagement separately from actual creation outcomes. This schema does not link the earlier gallery launcher to that later click, so it cannot establish cross-handoff conversion attribution. Missing terminal events and unknown outcomes must not be interpreted as success.

Shared stage events record observed active and extension-owned user-wait duration separately, in seconds. Functions-owned native-dependency and trigger-discovery retries contribute to retry/recovery metadata only when actually invoked. Trigger discovery is awaited and can fail the overall workflow even after `deploymentStatus=succeeded`; bounded `networkCategory` remains separate from that completion failure code. CLI exit or execution failure determines the command outcome, but remote `deploymentStatus` remains `unknown` without an authoritative Azure completion signal. CLI success does not prove Azure trigger/start health. The detached `postDeploy` notification response is correlated as a child; its wait and later work are excluded from the already-emitted root summary. Unobservable signals are unavailable, not fabricated zeros or completion. Payload tests prove instrumentation behavior, not a production failure-rate or diagnostic-coverage improvement.

When opening a newly created project restarts the extension host, cached `postFunctionCreate` diagnostics retain only validated, generated `workflowRunId` and `parentAttemptId` links and `isWorkflowRoot=false`. These replay records do not resume the normalized workflow schema, outcome, or timing, and are not creation attempts or evidence that the original root completed. Legacy cache entries without correlation remain readable and unlinked.

### Pull requests and reviews

Keep PR descriptions brief:

* `Fixes #<issue>` for each issue fixed; use `Fixes owner/repo#number` for another repository. If no issue is linked, say so rather than inventing one.
* A human-readable one- or two-line reason for the change.
* **Before:** a real screenshot reproducing the bug or showing the missing feature without the candidate changes.
* **After:** a real screenshot of the same scenario demonstrating the fix or feature with the candidate changes.

Reviews must first exercise that scenario without the candidate changes and capture a baseline screenshot, then exercise it with the candidate changes and capture a screenshot demonstrating the result. Use an isolated checkout or build; do not overwrite existing work. Screenshots supplement, not replace, regression tests and technical review.

Write each finding as one human-readable line describing the scenario and impact, with a file/line reference, severity, and smallest viable fix; attach a real screenshot showing any reported bug. Redact secrets and sensitive customer data, including resource names and user paths, from all evidence before sharing. Never fabricate screenshots or claim unperformed verification. If execution or capture is blocked, state the blocker and what remains unverified. For documentation-only or nonvisual changes, explain why screenshots do not apply and provide relevant diff, test, or other nonvisual evidence instead.

### Legal

Before we can accept your pull request you will need to sign a **Contribution License Agreement**. All you need to do is to submit a pull request, then the PR will get appropriately labelled (e.g. `cla-required`, `cla-norequired`, `cla-signed`, `cla-already-signed`). If you already signed the agreement we will continue with reviewing the PR, otherwise system will tell you how you can sign the CLA. Once you sign the CLA all future PR's will be labeled as `cla-signed`.

### Code of Conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

<!-- endregion exclude-from-marketplace -->

## Telemetry

Project and function creation telemetry distinguishes the gallery and classic experiences, banner dismissal, template selection, creation outcomes and cancellations, dependency installation, VS Code initialization, and opening behavior. Gallery telemetry uses template IDs from the loaded official catalog and known language/experience values; it does not collect template display names, folder paths, search text, or Copilot prompts. Closing a gallery during creation is recorded separately from cancellation, since closing the panel does not stop file creation.

Language telemetry is restricted to supported language categories; other setting or argument values are reported as `unknown`. Creation error and exception telemetry is fully redacted in both classic and gallery flows, including the classic-banner handoff. Detailed local errors remain available for troubleshooting.

VS Code collects usage data and sends it to Microsoft to help improve our products and services. Read our [privacy statement](https://go.microsoft.com/fwlink/?LinkID=521839) to learn more. If you don’t wish to send usage data to Microsoft, you can set the `telemetry.enableTelemetry` setting to `false`. Learn more in our [FAQ](https://code.visualstudio.com/docs/supporting/faq#_how-to-disable-telemetry-reporting).

## Lifecycle

The Azure Functions extension for VS Code follows the [Modern Lifecycle Policy](https://docs.microsoft.com/lifecycle/policies/modern). Follow instructions [here](https://code.visualstudio.com/docs/editor/extension-gallery) to get the latest updates of the extension.

### Support Dates
|Version|Start Date|Retirement Date|
|---|---|---|
|1.x|10/20/2020|In Support|

## License

[MIT](LICENSE.md)
