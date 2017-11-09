# Change Log
All notable changes to the "azurefunctions" extension will be documented in this file.

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
