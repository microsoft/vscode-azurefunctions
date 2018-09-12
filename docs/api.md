# Azure Functions API (Preview)

The following extension commands are supported for programatic use. If a parameter is not specified, the user will be prompted for the value. You must list 'ms-azuretools.vscode-azurefunctions' under the 'extensionDependencies' section of your package.json to ensure these apis are available to your extension.
> NOTE: The functions extension is still in preview and the apis are subject to change.

Commands:
* [Create New Project](#create-new-project)
* [Create Local Function](#create-local-function)
* [Create Function App](#create-function-app)
* [Deploy](#deploy)

## Create New Project

### Parameters

|Name|Type|Description|
|---|---|---|
|projectPath|string|Absolute file path that will contain your new project. If the path doesn't exist, it will be created.|
|language|string|The currently supported languages are 'JavaScript', 'C#', and 'Java'.|
|runtime|string|The currently supported runtimes are "~1" and "~2".|
|openFolder|boolean|(Defaulted to true) Represents whether or not to open the project folder after it has been created. If true, the extension host may be restarted when the folder is opened.|
|templateId|string|The id of an optional template you want to create with the new project.|
|functionName|string|The name of the optional function to be created with the new project.|
|functionSettings|{ [key: string]: string; }|Any settings unique to the optional function template. For example, the HttpTrigger template requires an AuthorizationLevel parameter.|

### Example Usage

```typescript
await vscode.commands.executeCommand('azureFunctions.createNewProject', projectPath, 'JavaScript', "~1", false /* openFolder */);
```

## Create Local Function

### Parameters

|Name|Type|Description|
|---|---|---|
|projectPath|string|Absolute file path that contains your project.|
|templateId|string|The id of the template you want to create.|
|functionName|string|The name of the function to be created.|
|functionSettings|{ [key: string]: string; }|Any settings unique to a template. For example, the HttpTrigger template requires an AuthorizationLevel parameter.|

### Example Usage

```typescript
await vscode.commands.executeCommand('azureFunctions.createFunction', projectPath, 'HttpTrigger-JavaScript', 'HttpTrigger1', { authLevel: 'Anonymous' });
```

## Create Function App

### Parameters

|Name|Type|Description|
|---|---|---|
|subscriptionId|string|The subscription you want to create the function app in.|
|resourceGroup|string|The resource group you want to create the function app in.|

This returns the id (a string) of the newly created function app (e.g. '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/exampleGroup/providers/Microsoft.Web/sites/exampleSite').

### Example Usage

```typescript
const functionAppId: string = await vscode.commands.executeCommand<string>('azureFunctions.createFunctionApp', '00000000-0000-0000-0000-000000000000');
const functionAppId: string = await vscode.commands.executeCommand<string>('azureFunctions.createFunctionApp', undefined, 'testResourceGroupName');
```

## Deploy

### Parameters

|Name|Type|Description|
|---|---|---|
|projectPath|string|Absolute file path that contains your project.|
|functionAppId|string|The id of the function app you are deploying to.|

### Example Usage

```typescript
await vscode.commands.executeCommand('azureFunctions.deploy', projectPath, '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/exampleGroup/providers/Microsoft.Web/sites/exampleSite');
```
