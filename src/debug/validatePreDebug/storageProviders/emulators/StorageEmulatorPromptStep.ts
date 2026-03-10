/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { ConnectionKey, localSettingsFileName } from '../../../../constants';
import { localize } from '../../../../localize';
import { type IPreDebugValidateContext } from '../../IPreDebugValidateContext';

export class StorageEmulatorPromptStep<T extends IPreDebugValidateContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        const azuriteExtension = vscode.extensions.getExtension('azurite.azurite');
        const installOrRun: vscode.MessageItem = azuriteExtension
            ? { title: localize('runAzurite', 'Run Emulator') }
            : { title: localize('installAzurite', 'Install Azurite') };
        const message: string = localize('failedToConnectEmulator', 'Failed to verify "{0}" connection specified in "{1}". Is the local emulator installed and running?', ConnectionKey.Storage, localSettingsFileName);
        const learnMoreLink: string = process.platform === 'win32' ? 'https://aka.ms/AA4ym56' : 'https://aka.ms/AA4yef8';
        const debugAnyway: vscode.MessageItem = { title: localize('debugAnyway', 'Debug anyway') };
        const result: vscode.MessageItem = await context.ui.showWarningMessage(message, { learnMoreLink, modal: true, stepName: 'failedToConnectEmulator' }, debugAnyway, installOrRun);

        if (result === installOrRun) {
            if (azuriteExtension) {
                context.startStorageEmulator = true;
            } else {
                await vscode.commands.executeCommand('workbench.extensions.installExtension', 'azurite.azurite');
                // Re-prompt after installing the extension
                return this.prompt(context);
            }
        }
    }

    public shouldPrompt(context: T): boolean {
        return context.startStorageEmulator === undefined;
    }
}
