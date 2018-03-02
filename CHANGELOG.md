# Change Log
All notable changes to the "azurefunctions" extension will be documented in this file.

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
* Create new project
* Create new function from template
* Debug function apps locally
* View Azure Functions
* Deploy to Azure Functions
* Start, stop, and restart Azure Functions
* JSON Intellisense for `function.json`, `host.json`, and `proxies.json`
