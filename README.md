# Azure Functions for Visual Studio Code

## Prerequisites
* [Node v8.0+](https://nodejs.org/)
  * Older versions of node will be supported soon. See issue [#1](https://github.com/Microsoft/vscode-azurefunctions/issues/1)
* [.NET Core 2.0](https://www.microsoft.com/net/download/core)
* [Azure Core Function Tools 2.0](https://www.npmjs.com/package/azure-functions-core-tools)
  ```
  npm install --global azure-functions-core-tools@core
  ```

## Features

* Create New Function App
* Create New Function
* Debug Function Apps
* View Azure Functions
* Start, Stop, and Restart Azure Functions
* JSON Intellisense for `function.json`, `host.json`, and `proxies.json`

### Create and F5 a new Function App

![Create and F5](resources/CreateAndF5.gif)

## Contributing
There are a couple of ways you can contribute to this repo:

- **Ideas, feature requests and bugs**: We are open to all ideas and we want to get rid of bugs! Use the Issues section to either report a new issue, provide your ideas or contribute to existing threads.
- **Documentation**: Found a typo or strangely worded sentences? Submit a PR!
- **Code**: Contribute bug fixes, features or design changes:
  - Clone the repository locally and open in VS Code.
  - Open the terminal (press `CTRL+`\`) and run `npm install`.
  - To build, press `F1` and type in `Tasks: Run Build Task`.
  - Debug: press `F5` to start debugging the extension.

### Legal
Before we can accept your pull request you will need to sign a **Contribution License Agreement**. All you need to do is to submit a pull request, then the PR will get appropriately labelled (e.g. `cla-required`, `cla-norequired`, `cla-signed`, `cla-already-signed`). If you already signed the agreement we will continue with reviewing the PR, otherwise system will tell you how you can sign the CLA. Once you sign the CLA all future PR's will be labeled as `cla-signed`.

### Code of Conduct
This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Telemetry
This extension collects telemetry data to help us build a better experience with Azure Functions and VS Code. The extension respects the `telemetry.enableTelemetry` setting which you can learn more about in our [FAQ](https://code.visualstudio.com/docs/supporting/faq#_how-to-disable-telemetry-reporting).

## License
[MIT](LICENSE.md)
