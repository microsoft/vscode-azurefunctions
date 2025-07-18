# Change Log

## 1.18.0 - 2025-07-14

### Overview
This release brings enhancements to Durable Functions through DTS integration, improves deployment reliability, and performance of the Azure Functions extension.

### Added
* [[4580](https://github.com/microsoft/vscode-azurefunctions/pull/4580)] Integrate deployment with Copilot, offering richer error analysis when deploying to Function Apps.
* [[4405](https://github.com/microsoft/vscode-azurefunctions/pull/4405)] Integrate **DTS emulator** into the **Local Workspace view**.
* [[4527](https://github.com/microsoft/vscode-azurefunctions/pull/4527)] Add **DTS preview support** for **Create Function** and remove **Netherite** from new storage options.
* [[4548](https://github.com/microsoft/vscode-azurefunctions/pull/4548)] Improved performance for listing and resolving resources

### Changed
* [[4529](https://github.com/microsoft/vscode-azurefunctions/pull/4529)] Check for **DTS trigger** before app creation to ensure a **Premium plan** is used.

### Fixed
* [[4573](https://github.com/microsoft/vscode-azurefunctions/pull/4573)] Fix: Advanced creation no longer prompts for user identity if **secret-based access** is used.
* [[4572](https://github.com/microsoft/vscode-azurefunctions/pull/4572)] Fix bug for **system identity** / resolved app ID.
* [[4576](https://github.com/microsoft/vscode-azurefunctions/pull/4576)] Fix container name to always be **lowercase**.

## 1.17.3 - 2025-05-19

### Added
* [[4487](https://github.com/microsoft/vscode-azurefunctions/pull/4487)] Upgrade to latest version of the Azure Activity Log (v2).  Now shows live progress on each activity child with timers.
* [[4500](https://github.com/microsoft/vscode-azurefunctions/pull/4500)] Add a step to **prompt about app authentication type** to allow users to opt out of `Managed Identities`
* [[4517](https://github.com/microsoft/vscode-azurefunctions/pull/4517)] Add **Python 3.12** to the list of supported versions.

### Changed
* [[4519](https://github.com/microsoft/vscode-azurefunctions/pull/4519)] Remove references to **"Azure Functions explorer"** in UI/strings.
* [[4506](https://github.com/microsoft/vscode-azurefunctions/pull/4506)] Use **OAuth2 tokens** when creating blob container to improve managed identity reliability.

### Fixed
* [[4494](https://github.com/microsoft/vscode-azurefunctions/pull/4494)] Configure **Flex Consumption** `functionAppConfig` deployments for **User Assigned Managed Identity**.
* [[4498](https://github.com/microsoft/vscode-azurefunctions/pull/4498)] Add required **app settings** for managed identity and trigger keys.
* [[4520](https://github.com/microsoft/vscode-azurefunctions/pull/4520)] Fix minor text by adding period to **"Enabled system assigned identity"** message.

## 1.17.2 - 2025-05-01

### Fixes
* [[4494]](https://github.com/microsoft/vscode-azurefunctions/pull/4494) Fixes function triggers not appearing under the "Functions" node in the remote view after deploying
* [[4493]](https://github.com/microsoft/vscode-azurefunctions/pull/4493) Incomplete telemetry data capture in specific scenarios.

## 1.17.1 - 2025-04-09

### Fixes
* [[4477]](https://github.com/microsoft/vscode-azurefunctions/pull/4477) Fixes errors on deployment due to checking major stacks
* [[4479]](https://github.com/microsoft/vscode-azurefunctions/pull/4479) Fixes deployment issues due to errors parsing `local.settings.json`

## 1.17.0 - 2025-04-08

### Overview
This release includes improvements to identity management and deployment validation in Azure Functions, along with enhancements to local development tooling and support for newer programming models. It also introduces user-facing warnings for deprecated runtime stacks and improved platform compatibility.

### Added
* [[4382](https://github.com/microsoft/vscode-azurefunctions/pull/4382)] Add a dedicated **Identity** node to the Azure Functions tree view for easier access and management of managed identities associated with Function Apps.
* [[4387](https://github.com/microsoft/vscode-azurefunctions/pull/4387)] Introduced **Local and Remote Identity Settings** commands, allowing users to configure managed identity settings directly from VS Code.
* [[4423](https://github.com/microsoft/vscode-azurefunctions/pull/4423)] Deployment validation now includes checks for **connection strings and managed identity configurations**.
* [[4428](https://github.com/microsoft/vscode-azurefunctions/pull/4428)] Added **end-of-life (EOL) warnings** when deploying or updating Function Apps that use **retired runtime stack versions** to help users upgrate to secured environments.

### Changed
* [[4425](https://github.com/microsoft/vscode-azurefunctions/pull/4425)] Marked **Linux Consumption plans** as **Legacy** as it is recommended to use **Flex Consumption** plans
* [[4457](https://github.com/microsoft/vscode-azurefunctions/pull/4457)] Updated the **Node.js v4 templates** to reflect the latest Azure Functions Core Tools.
* [[4427](https://github.com/microsoft/vscode-azurefunctions/pull/4427)] Updated default language selections to **use the newest programming model**, streamlining the Function App creation experience. If you need to use the old programming model, you can set the `azureFunctions.allowProgrammingModelSelection` setting to `true`.
* [[4431](https://github.com/microsoft/vscode-azurefunctions/pull/4431)] Enhanced local development support by detecting the absence of **Azurite**, and prompting users with the option to install or run it automatically.

## 1.16.3 - 2025-03-10

### Changed
* [[4397](https://github.com/microsoft/vscode-azurefunctions/pull/4397)] Automatically collect subscription and resource information for telemetry. [How to disable telemetry reporting](https://code.visualstudio.com/docs/supporting/FAQ#_how-to-disable-telemetry-reporting)
* [[4400](https://github.com/microsoft/vscode-azurefunctions/pull/4400)] Require VS Code version 1.95.0 (October 2024) or greater

## 1.16.2 - 2025-02-10

### Added
* [[4351]](https://github.com/microsoft/vscode-azurefunctions/pull/4351) Default flex consumption for basic creation
* [[4358]](https://github.com/microsoft/vscode-azurefunctions/pull/4358) SqlBinding triggers to verified list
* [[4359]](https://github.com/microsoft/vscode-azurefunctions/pull/4359) Set `publicBlobAccess` to false for created storage accounts
* [[4361]](https://github.com/microsoft/vscode-azurefunctions/pull/4361) Add basic support for Durable Task Scheduler resources
* [[4370]](https://github.com/microsoft/vscode-azurefunctions/pull/4370) Adds a number of commands related to the management of Durable Task Scheduler resources under preview flag

## 1.16.1 - 2024-11-13

### Fixes
* [[4333]](https://github.com/microsoft/vscode-azurefunctions/pull/4333) Fixes .NET debugging with multiple `.csproj` files

## 1.16.0 - 2024-11-11

### Added
* [[4292]](https://github.com/microsoft/vscode-azurefunctions/pull/4292) Create a setting to suppress readme tabs from opening for Python V2 templates
* [[4299]](https://github.com/microsoft/vscode-azurefunctions/pull/4299) Expose API commands to start a func task and to check if CLI tools are installed
* [[4298]](https://github.com/microsoft/vscode-azurefunctions/pull/4298) Add .NET 9.0 to list of runtimes and update backup templates

### Changed
* [[4286]](https://github.com/microsoft/vscode-azurefunctions/pull/4286) Exclude backup templates from credential scanning
* [[4291]](https://github.com/microsoft/vscode-azurefunctions/pull/4291) Use app insight connection string instead of aiKey
* [[4293]](https://github.com/microsoft/vscode-azurefunctions/pull/4293) Use vscode.git API to initialize new workspace
* [[4297]](https://github.com/microsoft/vscode-azurefunctions/pull/4297) For v2 templates, use `index.json` for template versioning and construct the URL ourselves

### Engineering
* [[4264]](https://github.com/microsoft/vscode-azurefunctions/pull/4264) Improvements to error masking
* [[4295]](https://github.com/microsoft/vscode-azurefunctions/pull/4295) Ensure `templateSchemaVersion` is set even if prompt is skipped
* [[4314]](https://github.com/microsoft/vscode-azurefunctions/pull/4314) Use `--roll-forward Major` flag to make `.dll` JSON CLI tool runtime agnostic
* [[4320]](https://github.com/microsoft/vscode-azurefunctions/pull/4320) Create a `RunningAzureFunctions` class to handle multiple function tasks in one workspace

**Full Changelog**: https://github.com/microsoft/vscode-azurefunctions/compare/v1.15.4...v1.16.0

## 1.15.4 - 2024-09-12
### Engineering
* [[4256]](https://github.com/microsoft/vscode-azurefunctions/pull/4256) Upgrade packages for additional improvements to telemetry
* [[4247]](https://github.com/microsoft/vscode-azurefunctions/pull/4247) [[4266]](https://github.com/microsoft/vscode-azurefunctions/pull/4266) Update release pipeline to support signing

## 1.15.3 - 2024-08-23
### Added
* [[4239]](https://github.com/microsoft/vscode-azurefunctions/pull/4239) Use a list task for the cache that is used for all resolving

### Removed
* [[4243]](https://github.com/microsoft/vscode-azurefunctions/pull/4243) Remove `EnableWorkerIndexing` feature flag

### Engineering
* [[4241]](https://github.com/microsoft/vscode-azurefunctions/pull/4241) Improve telemetry and performance

## 1.15.2 - 2024-08-08

### Engineering
* [[4165]](https://github.com/microsoft/vscode-azurefunctions/pull/4165) Show multiple runtime matches for `targetFramework` when creating from Functions API
* [[4195]](https://github.com/microsoft/vscode-azurefunctions/pull/4195) Enable end-to-end Azure tests and add more tests
* [[4215]](https://github.com/microsoft/vscode-azurefunctions/pull/4215) Update backup templates
* [[4200]](https://github.com/microsoft/vscode-azurefunctions/pull/4200) Upgrade `@azure/arm-appservice` to enable flex consumption SKU support

## 1.15.1 - 2024-06-19

### Changed
* [[4182]](https://github.com/microsoft/vscode-azurefunctions/pull/4182) Display a warning when attempting to deploy a containerized function app

### Fixed
* [[4184]](https://github.com/microsoft/vscode-azurefunctions/pull/4184) "+ Create new function app" command when deploying a containerized function app

## 1.15.0 - 2024-05-21

### Added
* [[4104]](https://github.com/microsoft/vscode-azurefunctions/pull/4104) Flex Consumption SKU support for creation and deploying
* [[4115]](https://github.com/microsoft/vscode-azurefunctions/pull/4115) Added Azure Blob Storage Trigger (using Event Grid) templates for flex consumption apps
* [[4138]](https://github.com/microsoft/vscode-azurefunctions/pull/4138) Display a warning after deploying an Azure Blob Storage Trigger to a flex consumption app
* [[4130]](https://github.com/microsoft/vscode-azurefunctions/pull/4130) `Create new function app` from Deploy command
* [[4101]](https://github.com/microsoft/vscode-azurefunctions/pull/4101) Add retry logic to getFunctionsForHostedProject on ECONNREFUSED
* [[4127]](https://github.com/microsoft/vscode-azurefunctions/pull/4127) Expanding in-proc .NET support

### Changed
* [[4125]](https://github.com/microsoft/vscode-azurefunctions/pull/4125) Changed deploying by function app id to use `azureFunctions.deployByFunctionAppId` rather than `azureFunctions.deploy`
* [[4130]](https://github.com/microsoft/vscode-azurefunctions/pull/4130) Various UX changes in local workspace view

**Full Changelog**: https://github.com/microsoft/vscode-azurefunctions/milestone/66?closed=1

## 1.14.3 - 2024-04-30

### Fixed
* [[4112]](https://github.com/microsoft/vscode-azurefunctions/pull/4112) Fix listing functions on sovereign clouds

## 1.14.2 - 2024-04-26

### Changed
* [[4096]](https://github.com/microsoft/vscode-azurefunctions/pull/4096) Update initial launch.json for Python to use debugpy

### Fixed
* Minor text fixes

## 1.14.1 - 2024-04-04

### Fixed
* [[4061]](https://github.com/microsoft/vscode-azurefunctions/pull/4061), [[4062]](https://github.com/microsoft/vscode-azurefunctions/pull/4062) Creating a function app with no workspace open

## 1.14.0 - 2024-03-21

### Added
* [[3943]](https://github.com/microsoft/vscode-azurefunctions/pull/3943), [[3964]](https://github.com/microsoft/vscode-azurefunctions/pull/3964)   Support for creating containerized function apps
* [[3929]](https://github.com/microsoft/vscode-azurefunctions/pull/3929) Support for creating containerized function projects

### Changed
* [[3984]](https://github.com/microsoft/vscode-azurefunctions/pull/3984) Improved "Execute Function" flow for EventGrid functions

## 1.13.3 - 2024-02-05

### Fixed
* [[3967]](https://github.com/microsoft/vscode-azurefunctions/issues/3967) Fixes functions not deploying for Linux Consumption apps
* [[3969]](https://github.com/microsoft/vscode-azurefunctions/issues/3969) Fixes deploy subpath setting being ignored

## 1.13.2 - 2024-01-31

### Added
* [[3881]](https://github.com/microsoft/vscode-azurefunctions/pull/3881) Add workspace functions to extension API
* [[3887]](https://github.com/microsoft/vscode-azurefunctions/pull/3887) Automatically enable full monitoring for Java Elastic Premium
* [[3916]](https://github.com/microsoft/vscode-azurefunctions/pull/3916) Add EventGrid Cloud Event templates for .NET to verified list
* [[3924]](https://github.com/microsoft/vscode-azurefunctions/pull/3924), [[3297]](https://github.com/microsoft/vscode-azurefunctions/pull/3927) Improve creating new local app setting experience during new function template creation

### Fixed
* [[3813]](https://github.com/microsoft/vscode-azurefunctions/pull/3813) Fix Windows files not appearing under the Files node
* [[3889]](https://github.com/microsoft/vscode-azurefunctions/pull/3889) Fix .gitignore being ignored during deployment

### Removed
* [[3902]](https://github.com/microsoft/vscode-azurefunctions/pull/3902) Remove Azure Account from extension dependencies

### Changed
* [[3888]](https://github.com/microsoft/vscode-azurefunctions/pull/3888) Revert hardcoded template version of '[3.*, 4.0.0)'
* [[3905]](https://github.com/microsoft/vscode-azurefunctions/pull/3905) Update all backup templates

### Engineering
* [[3831]](https://github.com/microsoft/vscode-azurefunctions/pull/3831) Use Node 18.15
* [[3832]](https://github.com/microsoft/vscode-azurefunctions/pull/3832) Remove all .NET 5 (EOL) tests
* [[3918]](https://github.com/microsoft/vscode-azurefunctions/pull/3918) Update `eslint-config` to enforce import types

**Full Changelog**: https://github.com/microsoft/vscode-azurefunctions/compare/v1.13.1...v1.13.2

## 1.13.1 - 2023-09-26

### Added
* Enable Python 3.11 for GA

### Changed
* Remove preview label from Node v4 programming model and make it the default over v3
* Remove '-alpha.7' from v4 node projects

## 1.13.0 - 2023-09-20

### Added
* Python V2 programming model GA by @nturinski in https://github.com/microsoft/vscode-azurefunctions/pull/3799
* Python V2 blueprint support by @nturinski in https://github.com/microsoft/vscode-azurefunctions/pull/3799
* .NET 8 SDK support @nturinski in https://github.com/microsoft/vscode-azurefunctions/pull/3841

### Fixed
* Fix Windows files node feature by @alexweininger in https://github.com/microsoft/vscode-azurefunctions/pull/3813
* Function app creation not setting `netFrameworkVersion` properly by @nturinski in https://github.com/microsoft/vscode-azurefunctions/pull/3847

**Full Changelog**: https://github.com/microsoft/vscode-azurefunctions/compare/v1.12.4...v1.13.0

## 1.12.4 - 2023-08-17

### Fixed
* Minor improvements to deployment logic by @nturinski in https://github.com/microsoft/vscode-azurefunctions/pull/3760

## 1.12.3 - 2023-08-10

### Fixed
* `(intermediate value).parsedBody.map is not a function` error when deploying Function App [#3769](https://github.com/microsoft/vscode-azurefunctions/issues/3769)
* Fail to connect to log stream [#3775](https://github.com/microsoft/vscode-azurefunctions/issues/3775)
* Unexpected status code: 401 when executing remote function [#3788](https://github.com/microsoft/vscode-azurefunctions/pull/3788)
* Azure Functions icon not appearing in the workspace view when using a light theme [#3783](https://github.com/microsoft/vscode-azurefunctions/issues/3783)

### Changed
* Azure Functions runtime V2 and V3 now show EOL warnings [#3771](https://github.com/microsoft/vscode-azurefunctions/pull/3771)

## 1.12.2 - 2023-08-01

### Fixed
* Fixed an issue where deployment failed due to empty lines in the `.funcignore` file.

## 1.12.1 - 2023-07-19

### Added
* Add Ballerina language support by @xlight05 in https://github.com/microsoft/vscode-azurefunctions/pull/3584

### Changed
* Print a warning if the function project root can't be found on deploy by @mkfrey in https://github.com/microsoft/vscode-azurefunctions/pull/3764

### Fixed
* Fix executing service bus topic trigger by @alexweininger in https://github.com/microsoft/vscode-azurefunctions/pull/3763

## 1.12.0 - 2023-07-13

### Added
* Add actions submenu to workspace view title by @alexweininger in [#3719](https://github.com/microsoft/vscode-azurefunctions/pull/3719)
* Allow user to create an Event Hub namespace and/or Event Hub when creating EventHubTrigger by @nturinski in [#3713](https://github.com/microsoft/vscode-azurefunctions/pull/3713)
* Support ZRS enabled storage accounts in advanced create by @alexweininger in [#3737](https://github.com/microsoft/vscode-azurefunctions/pull/3737)

### Fixed
* Fix view properties command for function apps by @alexweininger in [#3714](https://github.com/microsoft/vscode-azurefunctions/pull/3714)
* Fix SWA create function for node model v4 by @ejizba in [#3721]([#3721](https://github.com/microsoft/vscode-azurefunctions/pull/3721))
* Hardcode default bundle version by @alexweininger in [#3727](https://github.com/microsoft/vscode-azurefunctions/pull/3727)
* Fix create function app when workspace items are selected by @alexweininger in [#3732](https://github.com/microsoft/vscode-azurefunctions/pull/3732)
* Fix view properties command on remote function by @alexweininger in [#3736](https://github.com/microsoft/vscode-azurefunctions/pull/3736)

### Engineering
* Update to utils v2 by @alexweininger in [#3707](https://github.com/microsoft/vscode-azurefunctions/pull/3707)
* Upgrade to TS 5.1.3 by @alexweininger in [#3712](https://github.com/microsoft/vscode-azurefunctions/pull/3712)
* Remove onCommand activation events by @alexweininger in [#3741](https://github.com/microsoft/vscode-azurefunctions/pull/3741)
* Resolve using list instead of get by @alexweininger in [#3726](https://github.com/microsoft/vscode-azurefunctions/pull/3726)

### Dependencies
* Update dependencies to fix CG alerts by @bwateratmsft in [#3720](https://github.com/microsoft/vscode-azurefunctions/pull/3720)
* Bump semver from 5.7.1 to 7.5.2 by @dependabot in [#3724](https://github.com/microsoft/vscode-azurefunctions/pull/3724)

## 1.11.0 - 2023-05-23

### Changed
* Python V2 templates have left preview!
  * See the GA announcement [here](https://azure.microsoft.com/en-us/updates/generally-available-v2-programming-model-for-azure-functions-using-python/)
  * Learn more from the blog post [here](https://techcommunity.microsoft.com/t5/azure-compute-blog/azure-functions-v2-python-programming-model-is-generally/ba-p/3827474)

## 1.10.7 - 2023-05-17

### Added
* Add support for the upcoming Azure Resources Focus feature

## 1.10.6 - 2023-05-12

### Added
* Verify `AzureWebJobsFeatureFlags` setting has `EnableWorkerIndexing` and enable prior to deployment for Node Model v4 by @nturinski in https://github.com/microsoft/vscode-azurefunctions/pull/3653
* Add clean script to TypeScript projects by @ejizba in https://github.com/microsoft/vscode-azurefunctions/pull/3654
* Ensure that the app settings have propogated to production app before deploying by @nturinski in https://github.com/microsoft/vscode-azurefunctions/pull/3656
* Improve task comparison during project init by @alexweininger in https://github.com/microsoft/vscode-azurefunctions/pull/3671

### Fixed
* Change the name of the `windows-process-tree` module by @nturinski in https://github.com/microsoft/vscode-azurefunctions/pull/3669

## 1.10.5 - 2023-04-21

### Changed

- Update backup templates by @alexweininger in [#3602](https://github.com/microsoft/vscode-azurefunctions/pull/3602)

### Fixed

- Remove azureWebJobsStorage validation on deploy by @MicroFish91 in [#3647](https://github.com/microsoft/vscode-azurefunctions/pull/3647)
- Update .NET Isolated detection to check against the template ID by @MicroFish91 in [#3644](https://github.com/microsoft/vscode-azurefunctions/pull/3644)
- Fix parsing binding setting with missing help resource by @alexweininger in [#3601](https://github.com/microsoft/vscode-azurefunctions/pull/3601)
- Fix TypeScript project language detection by @alexweininger in [#3604](https://github.com/microsoft/vscode-azurefunctions/pull/3604)
- Don't throw error when missing 'requirements.txt' by @MicroFish91 in [#3627](https://github.com/microsoft/vscode-azurefunctions/pull/3627)

## 1.10.4 - 2023-03-09

### Changed

- Make skip for now message more clear when there are no resources available by @nturinski in [#3611](https://github.com/microsoft/vscode-azurefunctions/pull/3611)
- Change learn more label for programming model step by @nturinski in [#3609](https://github.com/microsoft/vscode-azurefunctions/pull/3609)
- Remove node.js programming model experimental flag by @nturinski in [#3612](https://github.com/microsoft/vscode-azurefunctions/pull/3612)

### Fixed
- Remove remote connection overwrite prompting by @MicroFish91 in [#3593](https://github.com/microsoft/vscode-azurefunctions/pull/3593)
- Add Dotnet Isolated runtime specific dependencies for Durable by @MicroFish91 in [#3597](https://github.com/microsoft/vscode-azurefunctions/pull/3597)
- Fix getting package references from csproj from multiple item groups by @alexweininger in [#3603](https://github.com/microsoft/vscode-azurefunctions/pull/3603)
- Fix when clause contexts for upcoming VS Code release (v1.77) by @MicroFish91 in [#3621](https://github.com/microsoft/vscode-azurefunctions/pull/3621)

## 1.10.3 - 2023-02-23

### Added
- Azure Functions walkthrough by @esweet431 in [#3573](https://github.com/microsoft/vscode-azurefunctions/pull/3573)

### Fixed
- Detect new NodeJs model during "Init for VS Code" by @ejizba in [#3586](https://github.com/microsoft/vscode-azurefunctions/pull/3586)
- Minor fixes for durable in new NodeJs model by @ejizba in [#3587](https://github.com/microsoft/vscode-azurefunctions/pull/3587)

## 1.10.2 - 2023-02-15

### Added
- Forward compatibility with Azure Resources API v2 by @alexweininger in [#3548](https://github.com/microsoft/vscode-azurefunctions/pull/3548)

## 1.10.1 - 2023-02-06

### Fixed

- Deployment failure due to `Function Core Tools` not being installed [#3556](https://github.com/microsoft/vscode-azurefunctions/issues/3556)
- Missing event hub connection prompt [#3554](https://github.com/microsoft/vscode-azurefunctions/issues/3551)

## 1.10.0 - 2023-02-02

### Added

- Enable support for Python 3.10 when creating projects [#3486](https://github.com/microsoft/vscode-azurefunctions/issues/3486)
- Support new Durable Functions backend options for the following languages: C#, JavaScript, TypeScript, Python [#3273](https://github.com/microsoft/vscode-azurefunctions/issues/3272)
- Support for new Node.js language model (Preview). Set feature flag `azureFunctions.showNodeProgrammingModel` to enable [#3285](https://github.com/microsoft/vscode-azurefunctions/issues/3285)
- Declared limited support for virtual workspaces [#2793](https://github.com/microsoft/vscode-azurefunctions/issues/2793)
- Added Azurite generated emulator files to .funcignore [#3371](https://github.com/microsoft/vscode-azurefunctions/issues/3371)

### Changed

- Removed deprecated .NET runtime stacks for creating new projects and Function Apps [#3474](https://github.com/microsoft/vscode-azurefunctions/issues/3474)
- Remove Python 3.6 due to EOL [#3526](https://github.com/microsoft/vscode-azurefunctions/issues/3526)
- Add warning messages for Azure Functions Core Tools EOL and mismatched versions [#3346](https://github.com/microsoft/vscode-azurefunctions/issues/3346) [#2985](https://github.com/microsoft/vscode-azurefunctions/issues/2985)
- Improve Core Tools install experience for Linux [#2745](https://github.com/microsoft/vscode-azurefunctions/issues/2745)

### Fixed

- [Bugs Fixed](https://github.com/microsoft/vscode-azurefunctions/milestone/60?closed=1)

## 1.9.0 - 2022-11-16

### Added

- Create Function button in Workspace view [#3350](https://github.com/microsoft/vscode-azurefunctions/issues/3350)
- Warning when a stack has an upcoming end of life [#3353](https://github.com/microsoft/vscode-azurefunctions/issues/3353)
- Updated host.json template to enable dynamic concurrency [#3248](https://github.com/microsoft/vscode-azurefunctions/issues/3248)

### Changed

- Always on = on when creating an Azure Function App on an App Service plan [#3037](https://github.com/microsoft/vscode-azurefunctions/issues/3037)
- Automatically run `npm install` after initializing a TypeScript or JavaScript Project [#3034](https://github.com/microsoft/vscode-azurefunctions/issues/3034)

### Fixed

- [Bugs Fixed](https://github.com/microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A1.9.0+)

## 1.8.3 - 2022-10-25

### Changed

- Revert addition of PyStein "feature flag" setting. [#3386](https://github.com/microsoft/vscode-azurefunctions/pull/3386)

## 1.8.2 - 2022-10-18

### Fixed

- Deployment failures initialized from "Deploy..." button on Workspace ribbon [#3369](https://github.com/microsoft/vscode-azurefunctions/issues/3369)

## 1.8.1 - 2022-09-26

### Fixed

- Log Analytic workspace resource provider not being registered blocked creation [#3352](https://github.com/microsoft/vscode-azurefunctions/issues/3352)

## 1.8.0 - 2022-09-20

### Added

- Support for new Python language model (set feature flag `azureFunctions.showPystienModel` to enable) [#3235](https://github.com/microsoft/vscode-azurefunctions/pull/3235)
- Support for Java 17 (Preview) [#3245](https://github.com/microsoft/vscode-azurefunctions/issues/3245)

### Changed

- Use appropriate version of extension bundle in Python V2 projects [#3304](https://github.com/microsoft/vscode-azurefunctions/issues/3304)
- Update Python V2 naming [#3305](https://github.com/microsoft/vscode-azurefunctions/issues/3305)
- update FUNCTIONS-WORKER-RUNTIME setting with remote function app [#3288](https://github.com/microsoft/vscode-azurefunctions/issues/3288)
- Add net7 tests [#3277](https://github.com/microsoft/vscode-azurefunctions/pull/3277)
- Just use the 1st value for creating python projects [#3276](https://github.com/microsoft/vscode-azurefunctions/pull/3276)
- Push Framework argument for .net70 [#3273](https://github.com/microsoft/vscode-azurefunctions/pull/3273)
- Switch to latest VS Code test package [#3275](https://github.com/microsoft/vscode-azurefunctions/pull/3275)
- Replace fse with AzExtFsUtils where possible [#3268](https://github.com/microsoft/vscode-azurefunctions/pull/3268)
- Update net7 template [#3262](https://github.com/microsoft/vscode-azurefunctions/pull/3262)
- Update backup templates [#3260](https://github.com/microsoft/vscode-azurefunctions/pull/3260)
- Move workflow from root to workflows folder [#3259](https://github.com/microsoft/vscode-azurefunctions/pull/3259)
- Rename info-needed-closer [#3257](https://github.com/microsoft/vscode-azurefunctions/pull/3257)
- Bump terser from 5.9.0 to 5.14.2 [#3253](https://github.com/microsoft/vscode-azurefunctions/pull/3253)
- Use shared azure id parsing utils [#3246](https://github.com/microsoft/vscode-azurefunctions/pull/3246)
- Add post release version bumper [#3244](https://github.com/microsoft/vscode-azurefunctions/pull/3244/files)
- Update AppInsights key [#3239](https://github.com/microsoft/vscode-azurefunctions/pull/3239)
- Update `FUNCTIONS-WORKER-RUNTIME` setting when deploying `dotnet-isolated` projects to `dotnet` remote [#3288](https://github.com/microsoft/vscode-azurefunctions/issues/3288)

### Fixed

- An error occurs for the setting "azureFunctions.projectLanguageModel" with the default value "0" [#3315](https://github.com/microsoft/vscode-azurefunctions/issues/3315)
- Do not open new documents if opened in new window [#3307](https://github.com/microsoft/vscode-azurefunctions/issues/3307)
- An error occurs if a Java/Python (New Model Preview) project opens in VS Code previously when creating a new Python project [#3300](https://github.com/microsoft/vscode-azurefunctions/issues/3300)
- [Suggestion] It would be better to change log to "Delete Slot 'xxx' Succeeded" in the ACTIVITYLOG window after deleting a slot [#3148](https://github.com/microsoft/vscode-azurefunctions/issues/3148)
- View properties doesn't display site config [#3264](https://github.com/microsoft/vscode-azurefunctions/issues/3264)
- Fix tests to use v4 Core Tools [#3267](https://github.com/microsoft/vscode-azurefunctions/pull/3267)
- App Insights APM 2.1 Enablement and Representation [#2835](https://github.com/microsoft/vscode-azurefunctions/issues/2835)
- [Suggestion] Don't show Logic Apps in Functions Extension [#3165](https://github.com/microsoft/vscode-azurefunctions/issues/3165)
- Fix `ServiceUnavailable` error that occurs in Files and Logs node [#3188](https://github.com/microsoft/vscode-azurefunctions/issues/3188)

## 1.7.4 - 2022-07-05

### Changed
- Updated minimum version of VS Code to 1.66.0 [#3231](https://github.com/microsoft/vscode-azurefunctions/pull/3231)
- Updated @vscode/extension-telemetry to 0.6.2 [#3229](https://github.com/microsoft/vscode-azurefunctions/pull/3229)

### Fixed
- Add node types to TS project template [#3199](https://github.com/microsoft/vscode-azurefunctions/issues/3199)
- Missing Advanced Create context menu item [#3171](https://github.com/microsoft/vscode-azurefunctions/issues/3171)

## 1.7.3 - 2022-06-01

### Changed
- Update @vscode/extension-telemetry to 0.5.2 [#3206](https://github.com/microsoft/vscode-azurefunctions/issues/3206)

## 1.7.2 - 2022-05-27

### Fixed
- Error when picking Create new local app setting from local.settings.json when creating blob trigger [#3191](https://github.com/microsoft/vscode-azurefunctions/issues/3191)

## 1.7.1 - 2022-05-26

### Added
- Deploy command is now accessible via the Workspace Deploy menu

## 1.7.0 - 2022-05-24

We've made some large design changes to the Azure extensions for VS Code. [View App Centric release notes](https://aka.ms/AzCode/AppCentric)

### Changed
- Add Execute Step in createFunction API [#3150](https://github.com/microsoft/vscode-azurefunctions/pull/3150)

### Fixed
- Fix "Create Project" flow losing options [#3116](https://github.com/microsoft/vscode-azurefunctions/pull/3116)

## 1.6.2 - 2022-04-13
### Fixed
- Zip deploy fails with ECONNRESET or 400 Bad Request on VS Code versions `>=1.66.0` [#2844](https://github.com/microsoft/vscode-azurefunctions/issues/2844)


## 1.6.1 - 2022-03-24
### Changed
- `createFunction` API handles multiple target frameworks
- Microsoft Cloud Deutschland (Azure Germany) is no longer supported. [Migration information](https://www.microsoft.com/en-us/cloud-platform/germany-cloud-regions)

## 1.6.0 - 2021-11-04
### Added
- Remove preview flag from Azure Functions v4
- Option to change Azure Functions runtime version when selecting runtime

### Removed
- AzureFunctionsExtensionApi command `validateFuncCoreToolsInstalled`

## 1.5.2 - 2021-10-12
### Added
- AzureFunctionsExtensionApi command `validateFuncCoreToolsInstalled`

### Changed
- `proxies.json` are no longer created when calling `Create New Project...`
- Proxy tree items are no longer displayed in local project tree view

## 1.5.1 - 2021-09-09
### Fixed
- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%221.5.1%22+is%3Aclosed+)

## 1.5.0 - 2021-08-27
### Added
- Preview support for .NET 6 on Azure Functions v4
- Added setting "azureFunctions.funcCliPath" to explicitly control the path of the "func" executable used for debug and deploy tasks

### Fixed
- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%221.5.0%22+is%3Aclosed)

### Changed
- Minimum version of VS Code is now 1.57.0

## 1.4.1 - 2021-07-14
### Fixed
- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%221.4.1%22+is%3Aclosed)

## 1.4.0 - 2021-05-25
### Added
- Support Azure Functions on Kubernetes with Azure Arc (Preview)

### Changed
- Minimum version of VS Code is now 1.53.0
- Icons updated to match VS Code's theme. Install new product icon themes [here](https://marketplace.visualstudio.com/search?term=tag%3Aproduct-icon-theme&target=VSCode)

### Fixed
- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%221.4.0%22+is%3Aclosed)

## 1.3.0 - 2021-03-10
### Added
- .NET 5 support for creating projects/functions, copying http trigger urls, and creating a Function App in Azure
- Now depends on the "Azure Resources" extension, which provides a "Resource Groups" and "Help and Feedback" view

### Changed
- TypeScript projects default to TypeScript v4.0

### [Fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%221.3.0%22+is%3Aclosed)
- Extension may become unresponsive when deploying on WSL or Codespaces
- Debugging a C# project on Mac/Linux may take ~30 seconds longer than before v1.2.1 of the extension

## 1.2.1 - 2021-02-09

### [Fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%221.2.1%22+is%3Aclosed)
- Fixed failure to debug on VS Code v1.53+ because extension did not activate
- Mitigated "ECONNRESET" errors by retrying the request

## 1.2.0 - 2021-01-21

### Added
- Allow Python v3.9 when creating a virtual environment for a local project
- Remove "Preview" label for custom handler projects

### [Fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%221.2.0%22+is%3Aclosed)
- Python project fails to attach debugger with error "The operation has timed out."

## 1.1.0 - 2020-12-11

### Added
- Support debugging .NET 5 projects
- Modified post-debug behavior so that "func host start" output remains viewable and to optimistically fix issue where VS Code becomes unresponsive [#1401](https://github.com/microsoft/vscode-azurefunctions/issues/1401)
- Added "Reload Templates" option when creating a function that will also clear the template cache (Use setting "azureFunctions.showReloadTemplates" to enable)

### Changed
- "Report an Issue" button has been removed from errors. Instead, use the "Report Issue" command in the [command palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette)

### Fixed
- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%221.1.0%22+is%3Aclosed)

## 1.0.1 - 2020-11-11

### Added
- Dynamically retrieve the runtime stacks available in Azure so that the extension supports them as soon as possible, including upcoming preview support for Node 14

## 1.0.0 - 2020-10-20

### Added
- Preview support for creating custom handler projects and functions
- Preview support for generating functions from an OpenAPI specification
- Extended deployment slot support to Linux consumption apps
- Warn when attempting to deploy a 64-bit C# project to a 32-bit Function App (thanks @prabh-62)
- Allow comments in "local.settings.json"

### Fixed
- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%221.0.0%22+is%3Aclosed)

## 0.24.1 - 2020-09-21

### [Fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.24.1%22+is%3Aclosed)

- Deploy error when `AzureWebJobsStorage` app setting doesn't have EndpointSuffix
- createFunction API call fails to create C# triggers

## 0.24.0 - 2020-08-25

### Added
- Create, debug, and deploy PowerShell 7 and Java 11 projects
- Preview support to deploy [custom handler](https://docs.microsoft.com/azure/azure-functions/functions-custom-handlers) projects
- Improved extension activation time (by switching to the [azure-sdk-for-js](https://github.com/Azure/azure-sdk-for-js))

### Changed
- Minimum version of VS Code is now 1.48.0
- Support for PowerShell 6 projects has been deprecated

### Fixed
- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.24.0%22+is%3Aclosed)

## 0.23.0 - 2020-07-08

### Added
- Added "Execute Function Now" for all trigger types
- Support viewing remote files on Linux consumption plans

### Changed
- To improve performance, "WEBSITE_RUN_FROM_PACKAGE" will automatically be added to all Windows plans when deploying. Set "WEBSITE_RUN_FROM_PACKAGE" to "0" to override this behavior

### Fixed
- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.23.0%22+is%3Aclosed)

## 0.22.1 - 2020-05-15

### Added
- Enhanced deployment logs to show more information and more accurately detect failures
- Added setting "azureFunctions.validateFuncCoreTools" to skip validating Azure Functions Core Tools before debugging

### Fixed
- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.22.1%22+is%3Aclosed)

### Changed
- Minimum version of VS Code is now 1.40.0

## 0.22.0 - 2020-04-08

### Added
- Enable/disable a function
- Added setting "azureFunctions.postDeployTask" to run a task after every deploy. New JavaScript/TypeScript projects will run "npm install" by default
- Improved performance of loading templates

### [Fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.22.0%22+is%3Aclosed)
- Pre-deploy task notification becomes unresponsive and prevents deploy
- Updated C# recommended extension id to "ms-dotnettools.csharp"

## 0.21.0 - 2020-03-03

### Added
- Java and C# support for the local project tree item
  - Copy local http trigger urls
  - Execute local timer triggers
- Allow Python 3.8 when creating local project or deploying to Azure (only supported in v3 of the Azure Functions runtime)
- Allow deploying Java projects to Linux Function Apps in Azure (only supported in v3 of the Azure Functions runtime)
- Added setting "azureFunctions.showDeployConfirmation" to turn off "Are you sure you want to deploy..." dialog
- Logging is enabled by default when creating a Function App in Azure

### Changed
- Bindings are no longer displayed in the tree. View properties on the function instead
- "Add Binding..." was moved from the local "Bindings" tree item to the function tree item
- Prompt for runtime before OS when creating a Function App in Azure. OS will not be prompted if the runtime doesn't support it
- Inline button to view deployment logs was removed. Left or right click the tree item instead

### [Fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.21.0%22+is%3Aclosed)
- Reduced time to create the first Function App in Azure on some new subscriptions
- Prompt to select existing resource group instead of "403" error when subscription doesn't have permissions to create
- "Init project for VS Code" will detect projects using "extensions.csproj" and configure to use "func extensions install" instead of bundle

## 0.20.2 - 2020-01-23

### Added
- Browse to website
- Added option to create a Node 12.x Function App, only supported in v3 of the Azure Functions runtime

### Changed
- If the Azure Functions runtime version cannot be automatically detected, default to v3 instead of v2
- Removed ability to update app settings in Azure if language or runtime version don't match when deploying. Instead, create a new Function App in Azure

### Fixed

- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.20.2%22+is%3Aclosed)

## 0.20.1 - 2019-12-05

### Added
- Select Python version (3.6.x or 3.7.x) when creating a project

### [Fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.20.1%22+is%3Aclosed)
- Linux Premium Function App fails to run because it's missing CONTENT* app settings

## 0.20.0 - 2019-11-04

### Added
- Select Node.js or Python runtime version when creating a Function App in Azure
- Added support for [Azure Functions v3 Preview](https://aka.ms/AA6i3ev) in the following existing features:
  - Install func cli from the command palette (brew and npm only)
  - Create new project/function from a version-specific template
  - Validate local version matches remote version when deploying
- View Files and Logs for your Function App in Azure

### Fixed

- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.20.0%22+is%3Aclosed)

### Changed

- Removed support for "azureFunctions.projectRuntime" value of "beta". Use "~1", "~2", or "~3" instead

## 0.19.1 - 2019-10-15

### [Fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.19.1%22+is%3Aclosed)

- Fix error "Expected value to be neither null nor undefined" when adding a binding

## 0.19.0 - 2019-10-14

### Added
- Added support for deployment slots (feature flag no longer required)
  - Deploy
  - Stream logs
  - Start/stop/restart
  - Create/delete/swap
- Default new Python projects to remote build. See here for more info: https://aka.ms/AA5vsfd
- Function templates respect extension bundle specified in host.json
- Add option to use a Premium (preview) hosting plan when creating a Function App in Azure

### [Fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.19.0%22+is%3Aclosed)
- Fixed subfolders of a symbolically linked folder not included during deploy
- Fixed bundle dependency not added during "Add Binding"
- Reduced false positive deploy failures when listing triggers or logs

## 0.18.1 - 2019-08-21

### [Fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.18.1%22+is%3Aclosed)

- Fix error "Expected value to be neither null nor undefined" when creating App Insights resource with existing resource group
- Fix error "r.map is not a function" if `Microsoft.Insights` is not a registered provider for your subscription

## 0.18.0 - 2019-08-19

### Added
- Added Python project support for remote build. Follow these steps to enable: https://aka.ms/AA5vsfd
- Added Application Insights support when creating a Function App in Azure
- Added a local project tree item to the Azure Functions view (does not apply to Java or C#)
  - Copy local http trigger urls
  - Execute local timer triggers
  - View and add bindings
- Removed "Preview" label from Python projects and Linux Function Apps

### Changed
- Removed setting "azureFunctions.advancedCreation" in favor of a separate "Advanced" command to create Function Apps
- Renamed default Python virtual environment from ".env" to ".venv"
- Basic create mode will now prompt for a location when creating a Function App

### [Fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.18.0%22+is%3Aclosed)
- Fixed copying non-anonymous function urls for Linux consumption apps
- Reduced occurrence of error "Failed to detect running Functions host" for C# debugging
- Fixed creation of Linux Dedicated Function Apps

## 0.17.1 - 2019-05-24

### [Fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.17.1%22+is%3Aclosed)

- Improve performance of loading Function Apps

## 0.17.0 - 2019-05-01

### Added

- New projects will no longer have a dependency on .NET Core for non-.NET developers
- Preview support to create, debug, and deploy PowerShell projects
- Right click in a "function.json" file to add a binding from a template
- New JavaScript projects will include a package.json, with automatic logic to install any dependencies before debug or deploy
- Right click on a timer function to execute now
- If in advanced create mode, you may use a premium plan when creating a Function App in Azure
- Added templates to the "verified" category, including Event Hub and Durable functions

### Fixed

- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.17.0%22+is%3Aclosed)

## 0.16.0 - 2019-03-28

### Added

- Improved multi-prompt wizards (e.g. "Create function")
  - Added support for back button
  - All prompts will occur up front before any steps are executed
- Creating a project will automatically prompt for the first function
- Projects in sub-directory of a workspace will be recognized as function projects
- Prompt to upload local app settings after deploy
- View commit in GitHub for an applicable deployment

### Changed
- Creating a Function App in Azure will only prompt for Function App name. Set `azureFunctions.advancedCreation` to `true` to be prompted for all other values.

### Fixed

- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.16.0%22+is%3Aclosed)

## 0.15.0 - 2019-02-22

### Added

- Create, debug, and deploy TypeScript projects
- Support for `.funcignore` file, which will exclude paths when deploying based on `.gitignore` syntax. This file is also used by the func cli.
- Added templates to the "verified" category, including Event Grid for most languages

### Changed

- If using "zipGlobPattern" and "zipIgnorePattern" settings when deploying, you will be prompted to use `.funcignore` file instead

### Fixed

- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.15.0%22+is%3Aclosed)

## 0.14.0 - 2019-02-11

### Added

- Improved startup and installation performance
- Improved reliability of Python projects
  - Leverages ptvsd module shipped with Python extension for VS Code instead of installing ptvsd in your virtual environment
  - Removed terminal specific separators from debug config
  - Allow deployment to dedicated App Service plans
  - Added retry logic to handle momentary issues while deploying
- Added `azureFunctions.advancedCreation` setting. When set to true, this allows you to manually select several properties (i.e. OS and runtime) when creating a Function App
- App setting values are hidden by default

### Changed

- Java projects now leverage common settings for deploy. See [our wiki](https://aka.ms/AA41zno) for more info
  - Projects will no longer run `mvn clean package` unless `azureFunctions.preDeployTask` is set
  - Projects will no longer deploy a subpath of the workspace unless `azureFunctions.deploySubpath` is set

### Fixed

- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.14.0%22+is%3Aclosed)

## 0.13.1 - 2018-12-17

### Fixed

- Provide option to "Deploy Anyway" if pre-deploy task fails
- If "azureFunctions.preDeployTask" is not set, do not run any task

## 0.13.0 - 2018-12-04

### Added

- Deployments node for Function Apps that are connected to a GitHub or LocalGit repository
  - View deployment logs
  - Redeploy previous deployments
- Preview support for deployment slots (feature flag `azureFunctions.enableSlots` must be set to `true`)
  - Deploy
  - Stream logs
  - Start/stop/restart
  - Create/delete/swap

### Changed

- Feature flag no longer required for creating Python projects

### Fixed

- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.13.0%22+label%3Abug+is%3Aclosed)

## 0.12.1 - 2018-11-26

### Fixed
- Bumped minimum version of "ps-tree" due to [event-stream#116](https://github.com/dominictarr/event-stream/issues/116)

## 0.12.0 - 2018-10-22

### Added

- Improved debugging
  - Functions host will be stopped after you detach
  - Terminal (where Http Triggers are listed) will be the default view rather than Debug Console
- Improved Python projects
  - Deploying will automatically sync triggers
  - Users will be warned if deploying to Windows
  - pylint will be added to the local virtual environment by default
  - "pip install" will be run before debugging
- Added Cosmos DB trigger to "Verified" category for C#
- JavaScript and Python projects will hide 'obj' and 'bin' folder by default (used for Functions extensions). NOTE: extensions.csproj will not be hidden and should still be checked in to source control

### Fixed

- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.12.0%22+label%3Abug+is%3Aclosed)

### Known Issues
- Local debugging for Python projects may fail with "python.exe -m ptvsd: error: the following arguments are required: --host.". Can be resolved by changing the `"languageWorkers__python__arguments"` setting in the `.vscode/tasks.json` to `"-m ptvsd --host 127.0.0.1 --port 9091"`

## 0.11.0 - 2018-09-24

### Added
- Preview support for creating and debugging Python projects. To enable, set `azureFunctions.enablePython` to true. **IMPORTANT**: Python support in Azure is still in private preview.
- Added several more templates to the "verified" category, including Cosmos DB and Service Bus.

### Changed
- Newly created Function Apps will default to "Run From Package". See [here](https://docs.microsoft.com/azure/azure-functions/run-functions-from-deployment-package) for more info.
- Deprecated projectRuntime of "beta" in favor of "~2".
- "azureFunctions.deploySubpath" setting takes precedence

### [Fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.11.0%22+label%3Abug+is%3Aclosed)
- "Copy Function Url" for v2 non-anonymous functions will copy an invalid url [#567](https://github.com/Microsoft/vscode-azurefunctions/issues/567)

### Known Issues
- Functions cannot be listed for Linux Consumption apps [azure-functions-host#3502](https://github.com/Azure/azure-functions-host/issues/3502)

## 0.10.2 - 2018-09-10

### Fixed

- Debugging C# functions after fixing a build break fails with error "Failed to stop previous running Functions host..." [#534](https://github.com/Microsoft/vscode-azurefunctions/issues/534)

## 0.10.1 - 2018-09-06

### Added

- Improved Java templates
  - More templates are available
  - Templates will be automatically updated going forward

### Changed

- JavaScript projects run `func extensions install` before debug and deploy

### Fixed

- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.10.1%22+label%3Abug+is%3Aclosed)

### Known Issues
- "Copy Function Url" for v2 non-anonymous functions will copy an invalid url (that returns a 401 Unauthorized error) due to recent breaking changes in the runtime [#567](https://github.com/Microsoft/vscode-azurefunctions/issues/567)

## 0.10.0 - 2018-07-24

### Added

- Improved C# templates
  - More templates are available
  - Templates will be automatically updated going forward
  - Templates are installed only with the scope of VS Code and no longer affect machine-wide .NET CLI templates
- Added support for deploying to App Service Environments

### Changed

- Debug config for JavaScript functions has changed. See https://aka.ms/AA1vrxa for more info
- New C# projects will deploy the result of a 'dotnet publish' rather than deploying the build output
- Azure Function Apps created through VS Code will automatically match the runtime from your local machine rather than always using v1

### Fixed

- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.10.0%22+label%3Abug+is%3Aclosed)

## 0.9.1 - 2018-05-23

### [Fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.9.1%22+label%3Abug+is%3Aclosed)

- Users will not be prompted to install the latest version of the func cli if high priority issues are discovered
  - For example, the latest version of the func cli (2.0.1-beta.26) [breaks JavaScript debugging](https://github.com/Microsoft/vscode-azurefunctions/issues/387)

## 0.9.0 - 2018-05-09

### Added

- Improved warning when Azure Functions Core Tools is out of date
  - In some cases, an 'Update' option is provided that will automatically run the necessary commmands
  - Warning now displays for all users, regardless of how they installed the func cli
- Function templates are now versioned and can be controlled with the "azureFunctions.templateVersion" setting
- Select open behavior after creating a new project ("Add to workspace", "Open in current window", or "Open in new window")

### Changed

- Moved Azure Functions Explorer to new Azure view container instead of file explorer

### Fixed

- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.9.0%22+label%3Abug+is%3Aclosed)

## 0.8.1 - 2018-04-13
### [Fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.8.1%22+label%3Abug+is%3Aclosed)
- Deployment fail when deploying to Function App with a custom domain

## 0.8.0 - 2018-04-05

### Added

- Upload and download application settings
- Prompt to automatically install the Azure Functions Core Tools when possible
- "Report an issue" button on error dialogs that links to the GitHub repo
- Subscription filter button next to Subscription nodes in the explorer
- Deploy to Function App context menu action for Function Apps

### Changed

- JavaScript projects will default to runtime "beta" instead of "~1" on Mac/Linux. See [here](https://aka.ms/azfuncruntime) for more information.

### Fixed

- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.8.0%22+label%3Abug+is%3Aclosed)

## 0.7.0 - 2018-03-05

### Added

- Automatically detect projects created outside of VS Code and prompt to initialize
- View/Delete Proxies
- Remote Debug Java Function Apps (experimental)

### Fixed

- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.7.0%22+label%3Abug+is%3Aclosed)

## 0.6.1 - 2018-02-22

### Fixed

- Add backup templates in case there is no internet or in case the functions portal api changes

## 0.6.0 - 2018-02-13

### Added

- Stream logs from your Azure Function Apps
- Support projects in multi-root workspaces
- Link to deployment tutorial

### [Fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.6.0%22+label%3Abug+is%3Aclosed)

- Show warning if your Azure Functions Core Tools version is out-of-date
- Update Microsoft.Net.Sdk.Functions version so that C# functions work on Mac/Linux

## 0.5.1 - 2018-02-01

### [Fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.5.1%22+label%3Abug+is%3Aclosed)

- C# local debugging
  - Fixed "Cannot access the file because it is being used by another process." error by automatically restarting the functions host
  - Fixed project being built twice for every F5
  - Improved performance of 'azureFunctions.pickProcess' on Windows

## 0.5.0 - 2018-01-25

### Added

- Create, Debug, and Deploy a C# class library project
- User settings for language/runtime/templateFilter now apply when creating a new project
  - Set these once and never select a language, runtime, or filter again
  - Set the language to something other than "JavaScript", "C#", or "Java" for preview support of other languages (for example, "C#Script")

### Fixed

- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.5.0%22+label%3Abug+is%3Aclosed)

### Known Issues

- The Functions host must be stopped after making changes and before rebuilding to C# functions [#185](https://github.com/Microsoft/vscode-azurefunctions/issues/185)
- C# class library functions fail to run on Mac [#164](https://github.com/Microsoft/vscode-azurefunctions/issues/164)
- C# script functions fail to attach on Windows [#180](https://github.com/Microsoft/vscode-azurefunctions/issues/180)

## 0.4.0 - 2017-12-15

### Added

- Copy HTTP Trigger Url
- Change Deployment Source (Zip Deploy vs. Local Git Deploy)
- Settings to control project language and runtime

### Fixed

- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.4.0%22+label%3Abug+is%3Aclosed)

## 0.3.1 - 2017-12-06

### Fixed

- JavaScript 'Verified' templates not displayed
- Java templates not displayed

## 0.3.0 - 2017-12-01

### Added

- Java support
  - Create new project
  - Create new function
  - Deploy project
- Azure Functions Explorer
  - View and delete functions
  - View, add, edit, and delete Application Settings
  - 'Load more' for large number of resources

### Fixed

- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.3.0%22+label%3Abug+is%3Aclosed)

## 0.2.0 - 2017-11-10

### Added

- Improved 'Create new function'
  - All JavaScript templates listed in the Azure portal are now supported
  - The user will be prompted for function settings on creation
  - Added `azureFunctions.templateFilter` setting to control which templates are displayed (Verified, Core, or All)
- Added 'Create' and 'Delete' commmands for Function Apps in Azure
- Updated icons to match the Azure portal

### Removed

- Moved 'Deploy here as Zip' option from Function App nodes to the explorer menu bar

### Fixed

- [Bugs fixed](https://github.com/Microsoft/vscode-azurefunctions/issues?q=is%3Aissue+milestone%3A%220.2.0%22+label%3Abug+is%3Aclosed)

## 0.1.1 - 2017-11-01

### Fixed

- Show warning message that zip deploy is a destructive action
- Leverage [new app service zipdeploy](https://github.com/projectkudu/kudu/wiki/Deploying-from-a-zip-file)

### Removed

- Zip Deploy no longer runs 'npm install'. It expects a ready-to-run app

## 0.1.0 - 2017-10-19

### Added

- Create new project
- Create new function from template
- Debug function projects locally
- View Azure Functions
- Deploy to Azure Functions
- Start, stop, and restart Azure Functions
- JSON Intellisense for `function.json`, `host.json`, and `proxies.json`
