# Project Runtime in VS Code

The local project runtime is controlled by the "azureFunctions.projectRuntime" setting in VS Code (located in `.vscode/settings.json` at the root of your repo). It's used to display templates when creating a new trigger and to validate the runtime when deploying to Azure. The currently supported runtimes are:

|VS Code Setting|Version|Status|Platform|Supported OS's|
|---|---|---|---|---|
|~1|1.x|Generally Available (GA)|.NET Framework|Windows|
|~2|2.x|Preview (as of 9/19/2018) but Generally Available (GA) soon|.NET Standard|Windows, Mac, and Linux|

It's recommended to use the same version of the runtime installed on your machine as the VS Code setting, but not required. For example, if you are developing on a Mac, you are required to install the "~2" runtime because "~1" only works on Windows. However, you might set your runtime to "~1" if your coworkers are developing on Windows or if you haven't migrated to "~2" in Azure yet. WARNING: This may lead to differences when running the Function App locally vs. remotely.

[See here](https://docs.microsoft.com/azure/azure-functions/functions-versions) for more information.
