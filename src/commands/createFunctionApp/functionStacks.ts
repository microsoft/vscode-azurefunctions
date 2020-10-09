/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pulling the latest stacks from here: https://github.com/pragnagopa/azure-functions-supported-runtime-stacks
 * Those stacks haven't rolled out to the "availableStacks" API yet. Once they do, we can switch to using that API instead of hard-coding here.
 * For example, the "availableStacks" API doesn't have the "supportedFunctionsExtensionVersions" property yet
 */

export interface IFunctionStack {
    name: string;
    display: string;
    majorVersions: IFunctionStackMajorVersion[];
}

export interface IFunctionStackMajorVersion {
    displayVersion: string;
    supportedFunctionsExtensionVersions: string[];
    runtimeVersion: string | undefined;
    appSettingsDictionary: { [key: string]: string };
    siteConfigPropertiesDictionary: {};
    isDeprecated: boolean;
    isPreview: boolean;
    isHidden: boolean;
}

export function getLinuxFunctionsStacks(): IFunctionStack[] {
    return getFunctionStacks(linuxFunctionsStacks);
}

export function getWindowsFunctionsStacks(): IFunctionStack[] {
    return getFunctionStacks(windowsFunctionsStacks);
}

function getFunctionStacks(data: string): IFunctionStack[] {
    return (<{ value: { properties: IFunctionStack }[] }>JSON.parse(data)).value.map(v => v.properties);
}

const linuxFunctionsStacks: string = `{
    "value": [
        {
            "id": null,
            "name": "dotnet",
            "type": "Microsoft.Web/availableStacks?osTypeSelected=LinuxFunctions",
            "properties": {
                "name": "dotnet",
                "display": ".NET Core",
                "dependency": null,
                "majorVersions": [
                    {
                        "displayVersion": "3.1",
                        "runtimeVersion": "dotnet|3.1",
                        "supportedFunctionsExtensionVersions": [
                            "~3"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "dotnet"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": false,
                            "linuxFxVersion": "dotnet|3.1"
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    },
                    {
                        "displayVersion": "2.2",
                        "runtimeVersion": "dotnet|2.2",
                        "supportedFunctionsExtensionVersions": [
                            "~2"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "dotnet"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": false,
                            "linuxFxVersion": "dotnet|2.2"
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    }
                ],
                "frameworks": [],
                "isDeprecated": null
            }
        },
        {
            "id": null,
            "name": "node",
            "type": "Microsoft.Web/availableStacks?osTypeSelected=LinuxFunctions",
            "properties": {
                "name": "node",
                "display": "Node.js",
                "dependency": null,
                "majorVersions": [
                    {
                        "displayVersion": "14",
                        "runtimeVersion": "Node|14",
                        "supportedFunctionsExtensionVersions": [
                            "~3"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "node"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": false,
                            "linuxFxVersion": "Node|14"
                        },
                        "isPreview": true,
                        "isDeprecated": false,
                        "isHidden": true
                    },
                    {
                        "displayVersion": "12",
                        "runtimeVersion": "Node|12",
                        "supportedFunctionsExtensionVersions": [
                            "~3"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "node"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": false,
                            "linuxFxVersion": "Node|12"
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    },
                    {
                        "displayVersion": "10",
                        "runtimeVersion": "Node|10",
                        "supportedFunctionsExtensionVersions": [
                            "~2",
                            "~3"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "node"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": false,
                            "linuxFxVersion": "Node|10"
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    }
                ],
                "frameworks": [],
                "isDeprecated": null
            }
        },
        {
            "id": null,
            "name": "python",
            "type": "Microsoft.Web/availableStacks?osTypeSelected=LinuxFunctions",
            "properties": {
                "name": "python",
                "display": "Python",
                "dependency": null,
                "majorVersions": [
                    {
                        "displayVersion": "3.6",
                        "runtimeVersion": "Python|3.6",
                        "supportedFunctionsExtensionVersions": [
                            "~2",
                            "~3"
                        ],
                        "isDefault": false,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "python"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": false,
                            "linuxFxVersion": "Python|3.6"
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    },
                    {
                        "displayVersion": "3.7",
                        "runtimeVersion": "Python|3.7",
                        "supportedFunctionsExtensionVersions": [
                            "~2",
                            "~3"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "python"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": false,
                            "linuxFxVersion": "Python|3.7"
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    },
                    {
                        "displayVersion": "3.8",
                        "runtimeVersion": "Python|3.8",
                        "supportedFunctionsExtensionVersions": [
                            "~3"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "python"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": false,
                            "linuxFxVersion": "Python|3.8"
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    }
                ],
                "frameworks": [],
                "isDeprecated": null
            }
        },
        {
            "id": null,
            "name": "Custom",
            "type": "Microsoft.Web/availableStacks?osTypeSelected=LinuxFunctions",
            "properties": {
                "name": "Custom",
                "display": "Custom",
                "dependency": null,
                "majorVersions": [
                    {
                        "displayVersion": "Custom Handler",
                        "runtimeVersion": "",
                        "supportedFunctionsExtensionVersions": [
                            "~2",
                            "~3"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "custom"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": false,
                            "linuxFxVersion": ""
                        },
                        "isPreview": true,
                        "isDeprecated": false,
                        "isHidden": false
                    }
                ],
                "frameworks": [],
                "isDeprecated": null
            }
        },
        {
            "id": null,
            "name": "java",
            "type": "Microsoft.Web/availableStacks?osTypeSelected=LinuxFunctions",
            "properties": {
                "name": "java",
                "display": "Java",
                "dependency": null,
                "majorVersions": [
                    {
                        "displayVersion": "8",
                        "runtimeVersion": "Java|8",
                        "supportedFunctionsExtensionVersions": [
                            "~3"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "java"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": false,
                            "linuxFxVersion": "Java|8"
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    },
                    {
                        "displayVersion": "11",
                        "runtimeVersion": "Java|11",
                        "supportedFunctionsExtensionVersions": [
                            "~3"
                        ],
                        "isDefault": false,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "java"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": false,
                            "linuxFxVersion": "Java|11"
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    }
                ],
                "frameworks": [],
                "isDeprecated": null
            }
        }
    ],
    "nextLink": null,
    "id": null
}`;

const windowsFunctionsStacks: string = `{
    "value": [
        {
            "id": null,
            "name": "dotnet",
            "type": "Microsoft.Web/availableStacks?osTypeSelected=WindowsFunctions",
            "properties": {
                "name": "dotnet",
                "display": ".NET Core",
                "dependency": null,
                "majorVersions": [
                    {
                        "displayVersion": "3.1",
                        "runtimeVersion": "3.1",
                        "supportedFunctionsExtensionVersions": [
                            "~3"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "dotnet"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": true
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    },
                    {
                        "displayVersion": "2.2",
                        "runtimeVersion": "2.2",
                        "supportedFunctionsExtensionVersions": [
                            "~2"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "dotnet"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": true
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    }
                ],
                "frameworks": [],
                "isDeprecated": null
            }
        },
        {
            "id": null,
            "name": ".Net Framework",
            "type": "Microsoft.Web/availableStacks?osTypeSelected=WindowsFunctions",
            "properties": {
                "name": ".Net Framework",
                "display": ".Net Framework",
                "dependency": null,
                "majorVersions": [
                    {
                        "displayVersion": "4.7",
                        "runtimeVersion": "4.7",
                        "supportedFunctionsExtensionVersions": [
                            "~1"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {},
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": true
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    }
                ],
                "frameworks": [],
                "isDeprecated": null
            }
        },
        {
            "id": null,
            "name": "node",
            "type": "Microsoft.Web/availableStacks?osTypeSelected=WindowsFunctions",
            "properties": {
                "name": "node",
                "display": "Node.js",
                "dependency": null,
                "majorVersions": [
                    {
                        "displayVersion": "14",
                        "runtimeVersion": "~14",
                        "supportedFunctionsExtensionVersions": [
                            "~3"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "node",
                            "WEBSITE_NODE_DEFAULT_VERSION": "~14"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": true
                        },
                        "isPreview": true,
                        "isDeprecated": false,
                        "isHidden": true
                    },
                    {
                        "displayVersion": "12",
                        "runtimeVersion": "~12",
                        "supportedFunctionsExtensionVersions": [
                            "~3"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "node",
                            "WEBSITE_NODE_DEFAULT_VERSION": "~12"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": true
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    },
                    {
                        "displayVersion": "10",
                        "runtimeVersion": "~10",
                        "supportedFunctionsExtensionVersions": [
                            "~2",
                            "~3"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "node",
                            "WEBSITE_NODE_DEFAULT_VERSION": "~10"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": true
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    },
                    {
                        "displayVersion": "8",
                        "runtimeVersion": "~8",
                        "supportedFunctionsExtensionVersions": [
                            "~2"
                        ],
                        "isDefault": false,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "node",
                            "WEBSITE_NODE_DEFAULT_VERSION": "~8"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": true
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    },
                    {
                        "displayVersion": "6",
                        "runtimeVersion": "6.11.2",
                        "supportedFunctionsExtensionVersions": [
                            "~1"
                        ],
                        "isDefault": false,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "WEBSITE_NODE_DEFAULT_VERSION": "6.11.2"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": true
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    }
                ],
                "frameworks": [],
                "isDeprecated": null
            }
        },
        {
            "id": null,
            "name": "custom",
            "type": "Microsoft.Web/availableStacks?osTypeSelected=WindowsFunctions",
            "properties": {
                "name": "Custom",
                "display": "Custom",
                "dependency": null,
                "majorVersions": [
                    {
                        "displayVersion": "Custom Handler",
                        "runtimeVersion": "Custom",
                        "supportedFunctionsExtensionVersions": [
                            "~3", "~2"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "custom"
                        },
                        "siteConfigPropertiesDictionary": {
                            "use32BitWorkerProcess": true
                        },
                        "isPreview": true,
                        "isDeprecated": false,
                        "isHidden": false
                    }
                ],
                "frameworks": [],
                "isDeprecated": null
            }
        },
        {
            "id": null,
            "name": "java",
            "type": "Microsoft.Web/availableStacks?osTypeSelected=WindowsFunctions",
            "properties": {
                "name": "java",
                "display": "Java",
                "dependency": null,
                "majorVersions": [
                    {
                        "displayVersion": "8",
                        "runtimeVersion": "1.8",
                        "supportedFunctionsExtensionVersions": [
                            "~2",
                            "~3"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "java"
                        },
                        "siteConfigPropertiesDictionary": {
                            "javaVersion": "1.8",
                            "use32BitWorkerProcess": true
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    },
                    {
                        "displayVersion": "11",
                        "runtimeVersion": "11",
                        "supportedFunctionsExtensionVersions": [
                            "~3"
                        ],
                        "isDefault": false,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "java"
                        },
                        "siteConfigPropertiesDictionary": {
                            "javaVersion": "11",
                            "use32BitWorkerProcess": true
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    }
                ],
                "frameworks": [],
                "isDeprecated": null
            }
        },
        {
            "id": null,
            "name": "powershell",
            "type": "Microsoft.Web/availableStacks?osTypeSelected=WindowsFunctions",
            "properties": {
                "name": "powershell",
                "display": "PowerShell Core",
                "dependency": null,
                "majorVersions": [
                    {
                        "displayVersion": "6.2",
                        "runtimeVersion": "~6",
                        "supportedFunctionsExtensionVersions": [
                            "~2",
                            "~3"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "powershell"
                        },
                        "siteConfigPropertiesDictionary": {
                            "powerShellVersion": "~6",
                            "use32BitWorkerProcess": true
                        },
                        "isPreview": false,
                        "isDeprecated": true,
                        "isHidden": false
                    },
                    {
                        "displayVersion": "7.0",
                        "runtimeVersion": "~7",
                        "supportedFunctionsExtensionVersions": [
                            "~3"
                        ],
                        "isDefault": true,
                        "minorVersions": [],
                        "applicationInsights": true,
                        "appSettingsDictionary": {
                            "FUNCTIONS_WORKER_RUNTIME": "powershell"
                        },
                        "siteConfigPropertiesDictionary": {
                            "powerShellVersion": "~7",
                            "use32BitWorkerProcess": true
                        },
                        "isPreview": false,
                        "isDeprecated": false,
                        "isHidden": false
                    }
                ],
                "frameworks": [],
                "isDeprecated": null
            }
        }
    ],
    "nextLink": null,
    "id": null
}`;
