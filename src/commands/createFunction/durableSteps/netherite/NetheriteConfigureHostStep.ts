/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStep, nonNullValue } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { hostFileName } from '../../../../constants';
import { viewOutput } from '../../../../constants-nls';
import { ext } from '../../../../extensionVariables';
import { IHostJsonV2, INetheriteTaskJson } from '../../../../funcConfig/host';
import { localize } from '../../../../localize';
import { netheriteUtils } from '../../../../utils/durableUtils';
import { IEventHubsConnectionWizardContext } from '../../../appSettings/connectionSettings/eventHubs/IEventHubsConnectionWizardContext';

export class NetheriteConfigureHostStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 245;

    public async execute(context: T): Promise<void> {
        const hostJsonPath: string = path.join(context.projectPath, hostFileName);

        if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
            context.telemetry.properties.netheriteHostConfigFailed = 'true';

            const message: string = localize('netheriteHostConfigFailed', 'Unable to find and configure "{0}" in your project root. You may need to configure your Netherite event hub settings manually.', hostFileName);
            ext.outputChannel.appendLog(message);

            const notification: string = localize('failedToConfigureHost', 'Failed to configure your "{0}".', hostFileName);
            void context.ui.showWarningMessage(notification, { title: viewOutput }).then(result => {
                if (result.title === viewOutput) {
                    ext.outputChannel.show();
                }
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
