/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import { commands, extensions } from 'vscode';
import { localize } from '../../../../localize';
import { type IPreDebugValidateContext } from '../../IPreDebugValidateContext';

export class StorageEmulatorStartStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 220;

    public async execute(context: T): Promise<void> {
        const azuriteExtension = extensions.getExtension('azurite.azurite');

        if (!azuriteExtension) {
            await context.ui.showWarningMessage(
                localize('azuriteNotInstalled', 'The Azurite extension is not installed. Install it to use the local storage emulator.'),
                { stepName: 'azuriteNotInstalled' },
            );
            await commands.executeCommand('workbench.extensions.installExtension', 'azurite.azurite');
        }

        await commands.executeCommand('azurite.start_blob');
        await commands.executeCommand('azurite.start_queue');
        await commands.executeCommand('azurite.start_table');
    }

    public shouldExecute(_context: T): boolean {
        return true;
    }
}
