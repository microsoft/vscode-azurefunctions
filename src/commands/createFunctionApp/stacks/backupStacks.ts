/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Last updated on 2021-05-24
export const backupStacks: string = `{
    "value": [
        {
            "id": null,
            "name": "dotnet",
            "type": "Microsoft.Web/functionAppStacks?stackOsType=All",
            "properties": {
                "displayText": ".NET",
                "value": "dotnet",
                "preferredOs": "windows",
                "majorVersions": [
                    {
                        "displayText": ".NET 5 (non-LTS)",
                        "value": "dotnet5",
                        "minorVersions": [
                            {
                                "displayText": ".NET 5 (non-LTS)",
                                "value": "5 (non-LTS)",
                                "stackSettings": {
                                    "windowsRuntimeSettings": {
                                        "runtimeVersion": "v5.0",
                                        "isHidden": true,
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "5.0.x"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": true,
                                            "netFrameworkVersion": "v5.0"
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~3"
                                        ]
                                    },
                                    "linuxRuntimeSettings": {
                                        "runtimeVersion": "DOTNET-ISOLATED|5.0",
                                        "isHidden": true,
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "5.0.x"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": true,
                                            "linuxFxVersion": "DOTNET-ISOLATED|5.0"
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~3"
                                        ]
                                    }
                                }
                            }
                        ]
                    },
                    {
                        "displayText": ".NET Core 2",
                        "value": "dotnetcore2",
                        "minorVersions": [
                            {
                                "displayText": ".NET Core 2.2",
                                "value": "2.2",
                                "stackSettings": {
                                    "windowsRuntimeSettings": {
                                        "runtimeVersion": "2.2",
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "remoteDebuggingSupported": false,
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "2.2.207"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "dotnet"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": true
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~2"
                                        ]
                                    },
                                    "linuxRuntimeSettings": {
                                        "runtimeVersion": "dotnet|2.2",
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "remoteDebuggingSupported": false,
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "2.2.207"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "dotnet"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": false,
                                            "linuxFxVersion": "dotnet|2.2"
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~2"
                                        ]
                                    }
                                }
                            }
                        ]
                    },
                    {
                        "displayText": ".NET Framework 4",
                        "value": "dotnetframework4",
                        "minorVersions": [
                            {
                                "displayText": ".NET Framework 4.7",
                                "value": "4.7",
                                "stackSettings": {
                                    "windowsRuntimeSettings": {
                                        "runtimeVersion": "4.7",
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": false
                                        },
                                        "appSettingsDictionary": {},
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": true
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~1"
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                ]
            }
        },
        {
            "id": null,
            "name": "node",
            "type": "Microsoft.Web/functionAppStacks?stackOsType=All",
            "properties": {
                "displayText": "Node.js",
                "value": "node",
                "preferredOs": "windows",
                "majorVersions": [
                    {
                        "displayText": "Node.js 14",
                        "value": "14",
                        "minorVersions": [
                            {
                                "displayText": "Node.js 14 LTS",
                                "value": "14 LTS",
                                "stackSettings": {
                                    "windowsRuntimeSettings": {
                                        "runtimeVersion": "~14",
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "14.x"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "node",
                                            "WEBSITE_NODE_DEFAULT_VERSION": "~14"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": true
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~3"
                                        ]
                                    },
                                    "linuxRuntimeSettings": {
                                        "runtimeVersion": "Node|14",
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "14.x"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "node"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": false,
                                            "linuxFxVersion": "Node|14"
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~3"
                                        ]
                                    }
                                }
                            }
                        ]
                    },
                    {
                        "displayText": "Node.js 12",
                        "value": "12",
                        "minorVersions": [
                            {
                                "displayText": "Node.js 12 LTS",
                                "value": "12 LTS",
                                "stackSettings": {
                                    "windowsRuntimeSettings": {
                                        "runtimeVersion": "~12",
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "12.x"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "node",
                                            "WEBSITE_NODE_DEFAULT_VERSION": "~12"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": true
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~3"
                                        ]
                                    },
                                    "linuxRuntimeSettings": {
                                        "runtimeVersion": "Node|12",
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "12.x"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "node"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": false,
                                            "linuxFxVersion": "Node|12"
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~3"
                                        ]
                                    }
                                }
                            }
                        ]
                    },
                    {
                        "displayText": "Node.js 10",
                        "value": "10",
                        "minorVersions": [
                            {
                                "displayText": "Node.js 10 LTS",
                                "value": "10 LTS",
                                "stackSettings": {
                                    "windowsRuntimeSettings": {
                                        "runtimeVersion": "~10",
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "10.x"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "node",
                                            "WEBSITE_NODE_DEFAULT_VERSION": "~10"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": true
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~2",
                                            "~3"
                                        ]
                                    },
                                    "linuxRuntimeSettings": {
                                        "runtimeVersion": "Node|10",
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "10.x"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "node"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": false,
                                            "linuxFxVersion": "Node|10"
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~2",
                                            "~3"
                                        ]
                                    }
                                }
                            }
                        ]
                    },
                    {
                        "displayText": "Node.js 8",
                        "value": "8",
                        "minorVersions": [
                            {
                                "displayText": "Node.js 8 LTS",
                                "value": "8 LTS",
                                "stackSettings": {
                                    "windowsRuntimeSettings": {
                                        "runtimeVersion": "~8",
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "8.x"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "node",
                                            "WEBSITE_NODE_DEFAULT_VERSION": "~8"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": true
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~2"
                                        ]
                                    }
                                }
                            }
                        ]
                    },
                    {
                        "displayText": "Node.js 6",
                        "value": "6",
                        "minorVersions": [
                            {
                                "displayText": "Node.js 6 LTS",
                                "value": "6 LTS",
                                "stackSettings": {
                                    "windowsRuntimeSettings": {
                                        "runtimeVersion": "~6",
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": false
                                        },
                                        "appSettingsDictionary": {
                                            "WEBSITE_NODE_DEFAULT_VERSION": "~6"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": true
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~1"
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                ]
            }
        },
        {
            "id": null,
            "name": "python",
            "type": "Microsoft.Web/functionAppStacks?stackOsType=All",
            "properties": {
                "displayText": "Python",
                "value": "python",
                "preferredOs": "linux",
                "majorVersions": [
                    {
                        "displayText": "Python 3",
                        "value": "3",
                        "minorVersions": [
                            {
                                "displayText": "Python 3.9",
                                "value": "3.9",
                                "stackSettings": {
                                    "linuxRuntimeSettings": {
                                        "runtimeVersion": "Python|3.9",
                                        "remoteDebuggingSupported": false,
                                        "isPreview": false,
                                        "isDefault": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "3.9"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "python"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": false,
                                            "linuxFxVersion": "Python|3.9"
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~3"
                                        ]
                                    }
                                }
                            },
                            {
                                "displayText": "Python 3.8",
                                "value": "3.8",
                                "stackSettings": {
                                    "linuxRuntimeSettings": {
                                        "runtimeVersion": "Python|3.8",
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "3.8"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "python"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": false,
                                            "linuxFxVersion": "Python|3.8"
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~3"
                                        ]
                                    }
                                }
                            },
                            {
                                "displayText": "Python 3.7",
                                "value": "3.7",
                                "stackSettings": {
                                    "linuxRuntimeSettings": {
                                        "runtimeVersion": "Python|3.7",
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "3.7"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "python"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": false,
                                            "linuxFxVersion": "Python|3.7"
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~2",
                                            "~3"
                                        ]
                                    }
                                }
                            },
                            {
                                "displayText": "Python 3.6",
                                "value": "3.6",
                                "stackSettings": {
                                    "linuxRuntimeSettings": {
                                        "runtimeVersion": "Python|3.6",
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "3.6"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "python"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": false,
                                            "linuxFxVersion": "Python|3.6"
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~2",
                                            "~3"
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                ]
            }
        },
        {
            "id": null,
            "name": "java",
            "type": "Microsoft.Web/functionAppStacks?stackOsType=All",
            "properties": {
                "displayText": "Java",
                "value": "java",
                "preferredOs": "windows",
                "majorVersions": [
                    {
                        "displayText": "Java 11",
                        "value": "11",
                        "minorVersions": [
                            {
                                "displayText": "Java 11",
                                "value": "11.0",
                                "stackSettings": {
                                    "windowsRuntimeSettings": {
                                        "runtimeVersion": "11",
                                        "isAutoUpdate": true,
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "11"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "java"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": true,
                                            "javaVersion": "11"
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~3"
                                        ]
                                    },
                                    "linuxRuntimeSettings": {
                                        "runtimeVersion": "Java|11",
                                        "isAutoUpdate": true,
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "11"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "java"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": false,
                                            "linuxFxVersion": "Java|11"
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~3"
                                        ]
                                    }
                                }
                            }
                        ]
                    },
                    {
                        "displayText": "Java 8",
                        "value": "8",
                        "minorVersions": [
                            {
                                "displayText": "Java 8",
                                "value": "8.0",
                                "stackSettings": {
                                    "windowsRuntimeSettings": {
                                        "runtimeVersion": "1.8",
                                        "isAutoUpdate": true,
                                        "isDefault": true,
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "8"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "java"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": true,
                                            "javaVersion": "1.8"
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~2",
                                            "~3"
                                        ]
                                    },
                                    "linuxRuntimeSettings": {
                                        "runtimeVersion": "Java|8",
                                        "isAutoUpdate": true,
                                        "isDefault": true,
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true,
                                            "supportedVersion": "8"
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "java"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": false,
                                            "linuxFxVersion": "Java|8"
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~3"
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                ]
            }
        },
        {
            "id": null,
            "name": "powershell",
            "type": "Microsoft.Web/functionAppStacks?stackOsType=All",
            "properties": {
                "displayText": "PowerShell Core",
                "value": "powershell",
                "preferredOs": "windows",
                "majorVersions": [
                    {
                        "displayText": "PowerShell 7",
                        "value": "7",
                        "minorVersions": [
                            {
                                "displayText": "PowerShell 7.0",
                                "value": "7.0",
                                "stackSettings": {
                                    "windowsRuntimeSettings": {
                                        "runtimeVersion": "~7",
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "powershell"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": true,
                                            "powerShellVersion": "~7"
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~3"
                                        ]
                                    },
                                    "linuxRuntimeSettings": {
                                        "runtimeVersion": "PowerShell|7",
                                        "isAutoUpdate": true,
                                        "isPreview": true,
                                        "isHidden": true,
                                        "remoteDebuggingSupported": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "gitHubActionSettings": {
                                            "isSupported": true
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "powershell"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": false,
                                            "linuxFxVersion": "PowerShell|7"
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~3"
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                ]
            }
        },
        {
            "id": null,
            "name": "custom",
            "type": "Microsoft.Web/functionAppStacks?stackOsType=All",
            "properties": {
                "displayText": "Custom Handler",
                "value": "custom",
                "preferredOs": "windows",
                "majorVersions": [
                    {
                        "displayText": "Custom Handler",
                        "value": "custom",
                        "minorVersions": [
                            {
                                "displayText": "Custom Handler",
                                "value": "custom",
                                "stackSettings": {
                                    "windowsRuntimeSettings": {
                                        "runtimeVersion": "custom",
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "remoteDebuggingSupported": false,
                                        "gitHubActionSettings": {
                                            "isSupported": false
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "custom"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": true
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~3",
                                            "~2"
                                        ]
                                    },
                                    "linuxRuntimeSettings": {
                                        "runtimeVersion": "",
                                        "isPreview": false,
                                        "appInsightsSettings": {
                                            "isSupported": true
                                        },
                                        "remoteDebuggingSupported": false,
                                        "gitHubActionSettings": {
                                            "isSupported": false
                                        },
                                        "appSettingsDictionary": {
                                            "FUNCTIONS_WORKER_RUNTIME": "custom"
                                        },
                                        "siteConfigPropertiesDictionary": {
                                            "use32BitWorkerProcess": false,
                                            "linuxFxVersion": ""
                                        },
                                        "supportedFunctionsExtensionVersions": [
                                            "~3",
                                            "~2"
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                ]
            }
        }
    ],
    "nextLink": null,
    "id": null
}`;
