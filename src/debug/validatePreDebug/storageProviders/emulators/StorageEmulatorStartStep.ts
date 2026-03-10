/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStepWithActivityOutput } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { localize } from '../../../../localize';
import { type IPreDebugValidateContext } from '../../IPreDebugValidateContext';

export class StorageEmulatorStartStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    public priority: number = 220;
    public stepName: string = 'storageEmulatorStartStep';

    protected getTreeItemLabel = () => localize('storageEmulatorStartLabel', 'Azurite storage emulator');
    protected getOutputLogSuccess = () => localize('storageEmulatorStartSuccess', 'Successfully started the Azurite storage emulator.');
    protected getOutputLogFail = () => localize('storageEmulatorStartFail', 'Failed to start the Azurite storage emulator.');

    public async execute(): Promise<void> {
        await vscode.commands.executeCommand('azurite.start_blob');
        await vscode.commands.executeCommand('azurite.start_table');
        await vscode.commands.executeCommand('azurite.start_queue');
    }

    public shouldExecute(context: T): boolean {
        return !!context.startStorageEmulator;
    }
}
