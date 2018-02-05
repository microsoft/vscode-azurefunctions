# Debugging .NET Framework functions in VS Code

The VS Code Debugger for C# [only supports](https://github.com/OmniSharp/omnisharp-vscode/issues/1716) attaching to 64-bit processes. However, v1.0 of the Azure Functions runtime defaults to 32-bit (See [this issue](https://github.com/Azure/azure-functions-cli/issues/117) for more info). Follow these instructions to install a 64-bit version:
1. Install the 32-bit version of the cli with the command `npm install -g azure-functions-core-tools`
1. Download a 64-bit version of the v1.0 cli from [here](https://github.com/Azure/azure-functions-core-tools/releases). The file name will look similar to "1.0.8-x64.zip".
1. Run `npm root -g` to find the root folder containing your global npm packages (likely `%USERPROFILE%\AppData\Roaming\npm\node_modules`)
1. Replace the files in `<npm global packages root>\azure-functions-core-tools\bin` with the un-zipped files

> NOTE: The VS Code extension for Azure Functions will warn you to install the 64-bit version of the Azure Functions CLI every time you create a .NET Framework based project (even after you have installed the 64-bit version). You may ignore that warning once you follow the above steps.
