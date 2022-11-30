/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ext } from '@microsoft/vscode-azext-azureappservice/out/src/extensionVariables';
import { AzExtFsExtra, AzureWizardExecuteStep, callWithTelemetryAndErrorHandling, nonNullValue } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { window } from 'vscode';
import { hostFileName } from '../../../../constants';
import { viewOutput } from '../../../../constants-nls';
import { IHostJsonV2, INetheriteTaskJson } from '../../../../funcConfig/host';
import { localize } from '../../../../localize';
import { netheriteUtils } from '../../../../utils/durableUtils';
import { IEventHubsConnectionWizardContext } from '../../../appSettings/IEventHubsConnectionWizardContext';

export class NetheriteConfigureHostStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 245;

    public async execute(context: T): Promise<void> {
        const hostJsonPath: string = path.join(context.projectPath, hostFileName);

        if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
            const message: string = localize('netheriteHostConfigFailed', 'Unable to find and configure "{0}" in your project root. You may need to configure your Netherite event hub settings manually.', hostFileName);
            ext.outputChannel.appendLog(message);

            await callWithTelemetryAndErrorHandling('netheriteHostConfigFailed', async () => {
                const notification: string = localize('failedToConfigureHost', 'Failed to configure your "{0}"', hostFileName);
                void window.showInformationMessage(notification, viewOutput).then(result => {
                    if (result === viewOutput) {
                        ext.outputChannel.show();
                    }
                });
            });

            return;
        }

        const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath) as IHostJsonV2;

        const durableTask = hostJson.extensions?.durableTask as INetheriteTaskJson ?? {};
        const existingHubName: string | undefined = durableTask?.hubName;

        hostJson.extensions ??= {};
        hostJson.extensions.durableTask = netheriteUtils.getDefaultNetheriteTaskConfig(
            nonNullValue(context.newEventHubName || existingHubName)
        );

        await AzExtFsExtra.writeJSON(hostJsonPath, hostJson);
    }

    public shouldExecute(context: T): boolean {
        return !!context.newEventHubName;
    }
}
