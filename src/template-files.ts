/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class TemplateFiles {
    private static readonly _taskId = "launchFunctionApp";
    private static readonly _tasksJson = {
        "version": "2.0.0",
        "tasks": [
            {
                "taskName": "Launch Function App",
                "identifier": TemplateFiles._taskId,
                "type": "shell",
                "command": "func host start",
                "isBackground": true,
                "presentation": {
                    "reveal": "silent"
                },
                "problemMatcher": [
                    {
                        "owner": "azureFunctions",
                        "pattern": [
                            {
                                "regexp": "\\b\\B",
                                "file": 1,
                                "location": 2,
                                "message": 3
                            }
                        ],
                        "background": {
                            "activeOnStart": true,
                            "beginsPattern": "^.*Stopping host.*",
                            "endsPattern": "^.*Job host started.*"
                        }
                    }
                ]
            }
        ]
    };

    private static readonly _launchJson = {
        "version": "0.2.0",
        "configurations": [
            {
                "name": "Attach to Azure Functions",
                "type": "node",
                "request": "attach",
                "port": 5858,
                "protocol": "inspector", // TODO: Verify behavior on older versions of node
                "preLaunchTask": TemplateFiles._taskId
            }
        ]
    };

    static get tasksJson() {
        return TemplateFiles.stringifyJSON(TemplateFiles._tasksJson);
    }

    static get launchJson() {
        return TemplateFiles.stringifyJSON(TemplateFiles._launchJson);
    }

    private static stringifyJSON(data: any): string {
        return JSON.stringify(data, null, "    ");
    }
}