/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BlobServiceClient } from '@azure/storage-blob';
import { AzureWizardExecuteStepWithActivityOutput } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { ConnectionKey, ConnectionType, localSettingsFileName, localStorageEmulatorConnectionString } from '../../../../../constants';
import { getLocalSettingsConnectionString } from '../../../../../funcConfig/local.settings';
import { localize } from '../../../../../localize';
import { type IStorageConnectionWizardContext } from '../IStorageConnectionWizardContext';

export class StorageEmulatorStartStep<T extends IStorageConnectionWizardContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    public priority: number = 220;
    public stepName: string = 'storageEmulatorStartStep';

    protected getTreeItemLabel = () => localize('storageEmulatorStartLabel', 'Start Azurite storage emulator');
    protected getOutputLogSuccess = () => localize('storageEmulatorStartSuccess', 'Successfully verified the Azurite storage emulator is running.');
    protected getOutputLogFail = () => localize('storageEmulatorStartFail', 'Failed to start or verify the Azurite storage emulator.');

    public async execute(context: T): Promise<void> {
        context.abortDebug = !await this.validateEmulatorIsRunning(context);
        this.options.continueOnFail = true;

        if (context.abortDebug) {
            throw new Error(this.getOutputLogFail());
        }
    }

    public shouldExecute(context: T): boolean {
        return context.azureWebJobsStorageType === ConnectionType.Emulator && !context.newStorageConnectionSettingValue;
    }

    /**
     * Pings the emulator to verify it's started; if it's not started, prompts to start it
     */
    private async validateEmulatorIsRunning(context: T): Promise<boolean> {
        let [azureWebJobsStorage] = await getLocalSettingsConnectionString(context, ConnectionKey.Storage, context.projectPath);
        azureWebJobsStorage ??= localStorageEmulatorConnectionString;

        try {
            const client = BlobServiceClient.fromConnectionString(azureWebJobsStorage, { retryOptions: { maxTries: 1 } });
            await client.getProperties();
        } catch {
            // azurite.azurite Check to see if azurite extension is installed
            const azuriteExtension = vscode.extensions.getExtension('azurite.azurite');
            const installOrRun: vscode.MessageItem = azuriteExtension ? { title: localize('runAzurite', 'Run Emulator') } : { title: localize('installAzurite', 'Install Azurite') };
            const message: string = localize('failedToConnectEmulator', 'Failed to verify "{0}" connection specified in "{1}". Is the local emulator installed and running?', ConnectionKey.Storage, localSettingsFileName);
            const learnMoreLink: string = process.platform === 'win32' ? 'https://aka.ms/AA4ym56' : 'https://aka.ms/AA4yef8';
            const debugAnyway: vscode.MessageItem = { title: localize('debugAnyway', 'Debug anyway') };
            const result: vscode.MessageItem = await context.ui.showWarningMessage(message, { learnMoreLink, modal: true, stepName: 'failedToConnectEmulator' }, debugAnyway, installOrRun);
            if (result === installOrRun) {
                if (azuriteExtension) {
                    await vscode.commands.executeCommand('azurite.start_blob');
                    await vscode.commands.executeCommand('azurite.start_table');
                    await vscode.commands.executeCommand('azurite.start_queue');
                } else {
                    await vscode.commands.executeCommand('workbench.extensions.installExtension', 'azurite.azurite');
                    return await this.validateEmulatorIsRunning(context);
                }

                return result === debugAnyway;
            }
        }

        return true;
    }
}
