/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { window } from 'vscode';
import { initializeProjectFromApp } from './initializeProjectFromApp';

/**
 * Mock command to test external runtime initialization
 */
export async function testExternalRuntimeCommand(context: IActionContext): Promise<void> {

    try {
        // Test different runtime configurations
        const testConfigs = [
            { id: 'test-ts-18', runtime: 'node', version: '18', description: 'TypeScript (Node) with Node 18' },
            { id: 'test-ts-22', runtime: 'node', version: '22', description: 'TypeScript (Node) with Node 22' },
            { id: 'test-py-311', runtime: 'python', version: '3.11', description: 'Python 3.11' },
            { id: 'test-py-312', runtime: 'python', version: '3.12', description: 'Python 3.12' },
            { id: 'test-py-313', runtime: 'python', version: '3.13', description: 'Python 3.13' },
        ];

        // Show quick pick to select test configuration
        const selectedConfig = await window.showQuickPick(
            testConfigs.map(config => ({
                label: config.description,
                description: `${config.runtime} ${config.version}`,
                detail: `Function App ID: ${config.id}`,
                config
            })),
            {
                placeHolder: 'Select a runtime configuration to test',
                ignoreFocusOut: true
            }
        );

        if (!selectedConfig) {
            return;
        }

        const { config } = selectedConfig;

        await initializeProjectFromApp(context, {
            functionAppResourceId: config.id,
            runtimeName: config.runtime,
            runtimeVersion: config.version
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await window.showErrorMessage(
            `Failed to initialize project: ${errorMessage}`,
            'OK'
        );
        throw error;
    }
}
