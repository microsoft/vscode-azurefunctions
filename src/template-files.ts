/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from './localize';
import { TemplateLanguage } from './templates/Template';

const taskId: string = 'launchFunctionApp';
const tasksJsonForJavascript: {} = {
    version: '2.0.0',
    tasks: [
        {
            taskName: localize('azFunc.launchFuncApp', 'Launch Function App'),
            identifier: taskId,
            type: 'shell',
            command: 'func host start',
            isBackground: true,
            presentation: {
                reveal: 'always'
            },
            problemMatcher: [
                {
                    owner: 'azureFunctions',
                    pattern: [
                        {
                            regexp: '\\b\\B',
                            file: 1,
                            location: 2,
                            message: 3
                        }
                    ],
                    background: {
                        activeOnStart: true,
                        beginsPattern: '^.*Stopping host.*',
                        endsPattern: '^.*Job host started.*'
                    }
                }
            ]
        }
    ]
};

const launchJsonForJavascript: {} = {
    version: '0.2.0',
    configurations: [
        {
            name: localize('azFunc.attachToFunc', 'Attach to Azure Functions'),
            type: 'node',
            request: 'attach',
            port: 5858,
            protocol: 'inspector',
            preLaunchTask: taskId
        }
    ]
};

const taskJsonForJava: {} = {
    version: '2.0.0',
    tasks: [
        {
            taskName: 'Launch Function App',
            identifier: 'launchFunctionApp',
            linux: {
                command: 'sh -c "mvn clean package && func host start --script-root %path%"'
            },
            osx: {
                command: 'sh -c "mvn clean package && func host start --script-root %path%"'
            },
            windows: {
                command: 'powershell mvn clean package; func host start --script-root %path%'
            },
            type: 'shell',
            isBackground: true,
            presentation: {
                reveal: 'always'
            },
            problemMatcher: [
                {
                    owner: 'azureFunctions',
                    pattern: [
                        {
                            regexp: '\\b\\B',
                            file: 1,
                            location: 2,
                            message: 3
                        }
                    ],
                    background: {
                        activeOnStart: true,
                        beginsPattern: '^.*Stopping host.*',
                        endsPattern: '^.*Job host started.*'
                    }
                }
            ]
        }
    ]
};

const launchJsonForJava: {} = {
    version: '0.2.0',
    configurations: [
        {
            name: localize('azFunc.attachToFunc', 'Attach to Azure Functions'),
            type: 'java',
            request: 'attach',
            hostName: 'localhost',
            port: 5005,
            preLaunchTask: taskId
        }
    ]
};

function stringifyJSON(data: {}): string {
    return JSON.stringify(data, null, '    ');
}

export function getTasksJson(language: string, args: string): string {
    switch (language) {
        case TemplateLanguage.Java:
            let taskJsonString: string = stringifyJSON(taskJsonForJava);
            taskJsonString = taskJsonString.replace(/%path%/g, args);

            return taskJsonString;
        default:
            return stringifyJSON(tasksJsonForJavascript);
    }
}

export function getLaunchJson(language: string): object {
    switch (language) {
        case TemplateLanguage.Java:
            return launchJsonForJava;
        default:
            return launchJsonForJavascript;
    }
}
