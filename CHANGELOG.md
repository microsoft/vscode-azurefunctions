<!-- markdownlint-disable MD024 -->

# Change Log

All notable changes to the "azurefunctions" extension will be documented in this file.

## 0.11.0 - 2018-09-24

### Added
- Preview support for creating and debugging Python projects. To enable, set `azureFunctions.enablePython` to true. **IMPORTANT**: Python support in Azure is still in private preview.
- Added several more templates to the "verified" category, including Cosmos DB and Service Bus.

### Changed
- Newly created function apps will default to "Run From Package". See [here](https://docs.microsoft.com/en-us/azure/azure-functions/run-functions-from-deployment-package) for more info.
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
- Deployment fail when deploying to function app with a custom domain

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

- Stream logs from your remote Function Apps
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
- Debug function apps locally
- View Azure Functions
- Deploy to Azure Functions
- Start, stop, and restart Azure Functions
- JSON Intellisense for `function.json`, `host.json`, and `proxies.json`
