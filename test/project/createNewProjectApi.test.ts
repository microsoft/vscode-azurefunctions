/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWithInputs } from '@microsoft/vscode-azext-dev';
import * as path from 'path';
import * as vscode from 'vscode';
import { FuncVersion, registerOnActionStartHandler } from '../../extension.bundle';
import { longRunningTestsEnabled, testFolderPath } from '../global.test';
import { getCSharpValidateOptions, getJavaScriptValidateOptions, validateProject } from './validateProject';

suite.only('Create New Project API (deprecated)', () => {
    // https://github.com/Microsoft/vscode-azurefunctions/blob/main/docs/api.md#create-new-project
    test('JavaScript', async () => {
        const projectPath: string = path.join(testFolderPath, 'createNewProjectApi');
        const commandId = 'azureFunctions.createNewProject';
        await runWithInputs(commandId, [/Model V3/, /skip for now/i], registerOnActionStartHandler, async () => {
            await vscode.commands.executeCommand(commandId, projectPath, 'JavaScript', '~2', false /* openFolder */);
        });
        await validateProject(projectPath, getJavaScriptValidateOptions(true /* hasPackageJson */, FuncVersion.v2));
    });

    // https://github.com/Microsoft/vscode-azurefunctions/blob/main/docs/api.md#create-new-project
    test('C# Script IoT', async function (this: Mocha.Context): Promise<void> {
        if (!longRunningTestsEnabled) {
            this.skip();
        }
        this.timeout(5 * 60 * 1000);
        // Intentionally testing IoTHub trigger since a partner team plans to use that
        const templateId: string = 'Azure.Function.CSharp.IotHubTrigger.2.x';
        const functionName: string = 'createFunctionApi';
        const namespace: string = 'Company.Function';
        const iotPath: string = 'messages/events';
        const connection: string = 'IoTHub_Setting';
        const projectPath: string = path.join(testFolderPath, 'createNewProjectApiCSharp');
        await vscode.commands.executeCommand('azureFunctions.createNewProject', projectPath, 'C#', '~2', false /* openFolder */, templateId, functionName, { namespace: namespace, Path: iotPath, Connection: connection });
        await validateProject(projectPath, getCSharpValidateOptions('netcoreapp2.1', FuncVersion.v2));
    });
});
