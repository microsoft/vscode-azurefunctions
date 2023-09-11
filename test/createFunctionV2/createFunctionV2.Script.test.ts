/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { FuncVersion, ProjectLanguage, TemplateSource } from '../../extension.bundle';
import { CreateFunctionTestCase, FunctionTesterBase } from '../createFunction/FunctionTesterBase';
import { allTemplateSources } from '../global.test';
import { getRotatingAuthLevel } from '../nightly/getRotatingValue';

class PythonFunctionV2Tester extends FunctionTesterBase {
    public language: ProjectLanguage = ProjectLanguage.Python;
    public languageModel: number = 2;

    public getExpectedPaths(functionName: string): string[] {
        return [
            path.join(functionName, 'function_app.py')
        ];
    }

    protected override async initializeTestFolder(testFolder: string): Promise<void> {
        await super.initializeTestFolder(testFolder);
        const requirementsContents = `azure-functions`;
        await AzExtFsExtra.writeFile(path.join(testFolder, 'requirements.txt'), requirementsContents)
    }
}

for (const version of [FuncVersion.v4]) {
    for (const source of allTemplateSources) {
        if (source === TemplateSource.Staging) {
            // v2 templates aren't in staging
            continue;
        }
        addSuite(new PythonFunctionV2Tester(version, source));
    }
}

function addSuite(tester: FunctionTesterBase): void {
    const testCases: CreateFunctionTestCase[] = [
        {
            functionName: 'HTTP trigger',
            inputs: [
                getRotatingAuthLevel()
            ],

        },
        {
            functionName: 'Timer Trigger',
            inputs: [
                '0 * * * * *'
            ]
        },
        {
            functionName: 'Blob trigger',
            inputs: [
                'mycontainer',
                'BlobStorageConnectionString'
            ]
        },
        {
            functionName: 'EventGrid trigger',
            inputs: ['eventgridname']
        },
        {
            functionName: 'EventHub trigger',
            inputs: [
                'myeventhub',
                'EventHubConnectionString'
            ]
        },
        {
            functionName: 'Queue trigger',
            inputs: [
                'myqueue',
                'QueueConnectionString'
            ]
        },
        {
            functionName: 'ServiceBus trigger',
            inputs: [
                'mysbqueue', // Use existing app setting
                'ServiceBusConnectionString'
            ]
        },
        {
            functionName: 'ServiceBus trigger',
            inputs: [
                'mysbtopic', // Use existing app setting
                'mysubscription',
                'ServiceBusConnectionString'
            ]
        },

    ];

    tester.addParallelSuite(testCases);
}
