# Change Log
All notable changes to the "azurefunctions" extension will be documented in this file.

## 0.3.1 - 2017-11-01
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