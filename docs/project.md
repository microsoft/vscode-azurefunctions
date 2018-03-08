# Project Structure in VS Code

The Azure Functions extension [provides a command](https://github.com/Microsoft/vscode-azurefunctions#create-new-project) to create a project specifically designed to work well in VS Code. However, you can also open an existing project and you will automatically be prompted to initialize it for use with VS Code. This will create several files in the ".vscode" folder at the root of your project:
1. [Settings.json](#settingsjson)
1. [Launch.json](#launchjson)
1. [Tasks.json](#tasksjson)
1. [Extensions.json](#extensionsjson)

> NOTE: If you are using git, all of these files should be checked in. The initialization process automatically checks your .gitignore file for ".vscode" and removes it if applicable.

## Settings.json

This file defines how the Azure Functions extension should behave for your specific project. For example, the "projectLanguage" setting determines which templates to display when you create a new function. The following settings are supported:
* azureFunctions.projectLanguage
* azureFunctions.projectRuntime
* azureFunctions.templateFilter
* azureFunctions.deploySubPath

You can search in the settings page of VS Code for more information on each setting.

## Launch.json

This file defines how VS Code attaches a debugger when you press F5. It is unique to the language for your project.

## Tasks.json

This file contains common tasks, such as building your project or running the Azure Functions host (you will never have to run `func host start` manually from the command line again!). It is unique to the language for your project.

## Extensions.json

This file lists all of the recommended extensions based on your project's langauge. It notifies any user that opens your project to install these extensions. For example, the [VS Code Debugger for C#](https://marketplace.visualstudio.com/items?itemName=ms-vscode.csharp) is recommended to debug C# projects.
