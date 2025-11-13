/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { type FunctionAppStackValue } from './createFunctionApp/stacks/models/FunctionAppStackModel';
import { initializeProjectFromApp } from './initializeProjectFromApp';

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
export async function initializeProjectForSlashAzure(
    context: IActionContext,
): Promise<void> {

    const { url: rawUrl }: { url: string } = await vscode.commands.executeCommand('vscode-dev-azurecloudshell.webOpener.getUrl');
    const url = new URL(rawUrl);

    const params: FunctionsQueryParams = await getFunctionsQueryParams(url);

    await initializeProjectFromApp(context, params);
}


export interface FunctionsQueryParams {
    functionAppResourceId: string;
    runtimeName: string;
    runtimeVersion: string;
}

const functionAppResourceIdKey = 'functionAppResourceId';
const runtimeNameKey = 'runtimeName';
const runtimeVersionKey = 'runtimeVersion';

async function getFunctionsQueryParams(url: URL) {
    const params: FunctionsQueryParams = {
        functionAppResourceId: url.searchParams.get(functionAppResourceIdKey) || '',
        runtimeName: url.searchParams.get(runtimeNameKey) || '',
        runtimeVersion: url.searchParams.get(runtimeVersionKey) || ''
    };
    return params;
}
