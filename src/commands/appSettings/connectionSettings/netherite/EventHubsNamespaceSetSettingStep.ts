/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStep, nonNullProp, parseError } from '@microsoft/vscode-azext-utils';
import * as path from "path";
import { CodeAction, ConnectionKey, hostFileName } from '../../../../constants';
import { ext } from '../../../../extensionVariables';
import { type IHostJsonV2, type INetheriteTaskJson } from '../../../../funcConfig/host';
import { localize } from '../../../../localize';
import { notifyFailedToConfigureHost } from '../notifyFailedToConfigureHost';
import { setLocalSetting } from '../setConnectionSetting';
import { type INetheriteConnectionWizardContext } from './INetheriteConnectionWizardContext';

export class EventHubsNamespaceSetSettingStep<T extends INetheriteConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 240;

    public async execute(context: T): Promise<void> {
        if (!context.newEventHubsNamespaceConnectionSettingKey) {
            try {
                await this.configureHostJson(context, ConnectionKey.EventHubs);
            } catch (e) {
                context.telemetry.properties.netheriteHostConfigFailed = 'true';
                const message: string = localize('netheriteHostConfigFailed', 'Unable to find and configure "{0}" in your project root. You may need to configure your event hubs connection name to "{1}".', hostFileName, ConnectionKey.EventHubs);
                notifyFailedToConfigureHost(context, message);
                ext.outputChannel.appendLog(parseError(e).message);
            }

            context.newEventHubsNamespaceConnectionSettingKey = ConnectionKey.EventHubs;
        }

        if (context.action === CodeAction.Debug) {
            await setLocalSetting(
                context,
                nonNullProp(context, 'newEventHubsNamespaceConnectionSettingKey'),
                nonNullProp(context, 'newEventHubsNamespaceConnectionSettingValue'),
            );
        } else {
            // No further action required
        }

        context.valuesToMask.push(context.newEventHubsNamespaceConnectionSettingValue as string);
    }

    public shouldExecute(context: T): boolean {
        return !!context.newEventHubsNamespaceConnectionSettingValue;
    }

    private async configureHostJson(context: T, eventHubsKey: string) {
        const hostJsonPath: string = path.join(context.projectPath, hostFileName);
        const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath) as IHostJsonV2;

        hostJson.extensions ??= {};
        hostJson.extensions.durableTask ??= {};

        const durableTask = hostJson.extensions.durableTask as INetheriteTaskJson;
        durableTask.storageProvider ??= {};
        durableTask.storageProvider.EventHubsConnectionName = eventHubsKey;

        await AzExtFsExtra.writeJSON(hostJsonPath, hostJson);
    }
}
