/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { workspace } from 'vscode';
import { updateWorkspaceSetting } from '../vsCodeConfig/settings';
import { type FunctionAppStackValue } from './createFunctionApp/stacks/models/FunctionAppStackModel';
import { createNewProjectInternal } from './createNewProject/createNewProject';
import { type FunctionsQueryParams } from './initializeProjectForSlashAzure';

export type RuntimeName = FunctionAppStackValue | 'dotnet-isolated';

/**
 *
 * Needs to initialize a local project based on the given function app information.
 *
 * @param context
 * @param id id of the function app in Azure
 * @param runtimeName ex: 'node', 'python', 'dotnet', etc.
 * @param runtimeVersion ex: '18', '3.11', '8.0', etc.
 */
export async function initializeProjectFromApp(
    context: IActionContext,
    options: FunctionsQueryParams,
): Promise<void> {
    const { functionAppResourceId, runtimeName, runtimeVersion } = options;

    const workspaceFolder = workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
        throw new Error('No workspace folder is open.');
    }

    if (functionAppResourceId) {
        // set defaultFunctionAppToDeploy setting to the given function app id
        await updateWorkspaceSetting('defaultFunctionAppToDeploy', functionAppResourceId, workspaceFolder);
    }

    context.telemetry.properties.externalRuntimeName = runtimeName;
    context.telemetry.properties.externalRuntimeVersion = runtimeVersion;

    // todo set id in settings as the default app to deploy to
    console.log(functionAppResourceId);

    // Initialize the project using the existing createNewProjectInternal with external runtime config
    await createNewProjectInternal(context, {
        folderPath: workspaceFolder.uri.fsPath,
        suppressOpenFolder: true, // Don't open folder since we're in current workspace
        externalRuntimeConfig: {
            runtimeName,
            runtimeVersion
        }
    });
}
