# Azure Functions for Visual Studio Code (Preview)

## Prerequisites

* Install your desired version of the [Azure Functions Core Tools](https://docs.microsoft.com/azure/azure-functions/functions-run-local)
  * For version 2.0 (This version works cross-platform, but is still in preview and not recommended for production):
    * Install [.NET Core 2.0](https://www.microsoft.com/net/download/core)
    * Install the Azure Functions Core Tools:
    ```bash
    npm install -g azure-functions-core-tools@core
    ```
    > Note: When installing on Ubuntu, you may need to use `sudo`. On MacOS and Linux, you may need to include the `unsafe-perm` flag, as follows:
    ```bash
    sudo npm install -g azure-functions-core-tools@core --unsafe-perm true
    ```
  * For version 1.0 (This version is only supported on Windows):
    ```bash
    npm install -g azure-functions-core-tools
    ```
* Install the prerequisites for your desired language:
  * [JavaScript](#javascript)
  * [C#](#csharp)
  * [Java](#java)
> NOTE: You may change your `azureFunctions.projectLanguage` user setting to multiple other 'preview' languages not listed above. This allows you to create a project/function in that language, but we do not yet support local debugging for these languages.

## Features

* Create new Function projects
* Create new Functions from a template
* Debug Function projects locally
* Deploy to Azure Function Apps
* View, create, delete, start, stop, and restart Azure Function Apps
* JSON Intellisense for `function.json`, `host.json`, and `proxies.json`

### Create New Project

![CreateProject](resources/CreateProject.gif)

### Debug Function App Locally

![Debug](resources/Debug.gif)

### Deploy to Azure

![Deploy](resources/Deploy.gif)

## Language-Specific Prerequisites

### JavaScript

* [Node 8.0+](https://nodejs.org/)

### CSharp

* [VS Code Debugger for C#](https://marketplace.visualstudio.com/items?itemName=ms-vscode.csharp)
* [Dotnet cli](https://docs.microsoft.com/dotnet/core/tools/?tabs=netcore2x)
* Dotnet Templates for Azure Functions
  * You will be automatically prompted to install these templates when you first create a project/function
    * If you are using v2.0 of the Azure Functions runtime, you must install the beta (.NET Core) templates
    * If you are using v1.0 of the Azure Functions runtime, you must install the v1.0 (.NET Framework) templates
  * You may uninstall or reinstall the templates with the following steps:
    1. Open Command Palette (View -> Command Palette...)
    1. Search for "Azure Functions" and "install" or "uninstall"
    1. Run the corresponding command for dotnet templates

> NOTE: The default experience for C# uses class libraries (&ast;.cs files), which provide superior performance, scalability, and versatility over C# Scripts (&ast;.csx files). If you want to use C# Scripts, you may change your `azureFunctions.projectLanguage` user setting to `C#Script`.

### Java

* [VS Code Debugger for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-debug)
* [JDK 1.8+](http://www.oracle.com/technetwork/java/javase/downloads/index.html)
* [Maven 3.0+](https://maven.apache.org/)

## Contributing
There are a couple of ways you can contribute to this repo:

- **Ideas, feature requests and bugs**: We are open to all ideas and we want to get rid of bugs! Use the Issues section to either report a new issue, provide your ideas or contribute to existing threads.
- **Documentation**: Found a typo or strangely worded sentences? Submit a PR!
- **Code**: Contribute bug fixes, features or design changes:
  - Clone the repository locally and open in VS Code.
  - Install [TSLint for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=eg2.tslint).
  - Open the terminal (press `CTRL+`\`) and run `npm install`.
  - To build, press `F1` and type in `Tasks: Run Build Task`.
  - Debug: press `F5` to start debugging the extension.

### Legal
Before we can accept your pull request you will need to sign a **Contribution License Agreement**. All you need to do is to submit a pull request, then the PR will get appropriately labelled (e.g. `cla-required`, `cla-norequired`, `cla-signed`, `cla-already-signed`). If you already signed the agreement we will continue with reviewing the PR, otherwise system will tell you how you can sign the CLA. Once you sign the CLA all future PR's will be labeled as `cla-signed`.

### Code of Conduct
This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Telemetry
VS Code collects usage data and sends it to Microsoft to help improve our products and services. Read our [privacy statement](https://go.microsoft.com/fwlink/?LinkID=528096&clcid=0x409) to learn more. If you don’t wish to send usage data to Microsoft, you can set the `telemetry.enableTelemetry` setting to `false`. Learn more in our [FAQ](https://code.visualstudio.com/docs/supporting/faq#_how-to-disable-telemetry-reporting).

## License
[MIT](LICENSE.md)
