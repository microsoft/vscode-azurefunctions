/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from './localize';
import { TemplateLanguage } from './templates/Template';

const taskId: string = 'launchFunctionApp';

const tasksJson: {} = {
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

const mavenCleanPackageTask: {} = {
    taskName: 'Maven Clean Package',
    type: 'shell',
    command: 'mvn clean package',
    isBackground: true
};

export function getLaunchJson(language: string): object {
    switch (language) {
        case TemplateLanguage.Java:
            return launchJsonForJava;
        default:
            return launchJsonForJavascript;
    }
}

export function getTasksJson(language: string, args: string): object {
    switch (language) {
        case TemplateLanguage.Java:
            /* tslint:disable:no-string-literal no-unsafe-any */
            const taskJsonForJava: {} = JSON.parse(JSON.stringify(tasksJson)); // deep clone
            taskJsonForJava['tasks'][0].command += ` --script-root ${args}`;
            taskJsonForJava['tasks'][0].dependsOn = ['Maven Clean Package'];
            taskJsonForJava['tasks'].push(mavenCleanPackageTask);

            return taskJsonForJava;
        default:
            return tasksJson;
    }
}
