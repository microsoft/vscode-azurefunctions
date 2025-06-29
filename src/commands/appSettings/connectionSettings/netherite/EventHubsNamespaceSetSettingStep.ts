/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStep, nonNullProp } from '@microsoft/vscode-azext-utils';
import * as path from "path";
import { hostFileName } from '../../../../constants';
import { type IHostJsonV2, type INetheriteTaskJson } from '../../../../funcConfig/host';
import { localize } from '../../../../localize';
import { notifyFailedToConfigureHost } from '../notifyFailedToConfigureHost';
import { setConnectionSetting } from '../setConnectionSetting';
import { type INetheriteConnectionWizardContext } from './INetheriteConnectionWizardContext';

export class EventHubsNamespaceSetSettingStep<T extends INetheriteConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 240;

    public async execute(context: T): Promise<void> {
        if (!context.newEventHubsNamespaceConnectionSettingKey) {
            const defaultEventHubsKey: string = 'EventHubsConnection';
            await this.configureHostJson(context, defaultEventHubsKey);
            context.newEventHubsNamespaceConnectionSettingKey = defaultEventHubsKey;
        }

        await setConnectionSetting(
            context,
            nonNullProp(context, 'newEventHubsNamespaceConnectionSettingKey'),
            nonNullProp(context, 'newEventHubsNamespaceConnectionSettingValue'),
        );

        context.valuesToMask.push(context.newDTSConnectionSettingValue as string);
    }

    public shouldExecute(context: T): boolean {
        return !!context.newEventHubsNamespaceConnectionSettingValue;
    }

    private async configureHostJson(context: T, eventHubsKey: string) {
        const hostJsonPath: string = path.join(context.projectPath, hostFileName);

        if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
            context.telemetry.properties.netheriteHostConfigFailed = 'true';
            const message: string = localize('netheriteHostConfigFailed', 'Unable to find and configure "{0}" in your project root. You may need to configure your Netherite event hub namespace settings manually.', hostFileName);
            notifyFailedToConfigureHost(context, message);
            return;
        }

        const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath) as IHostJsonV2;
        hostJson.extensions ??= {};
        hostJson.extensions.durableTask ??= {};

        const durableTask = hostJson.extensions.durableTask as INetheriteTaskJson;
        durableTask.storageProvider ??= {};
        durableTask.storageProvider.EventHubsConnectionName = eventHubsKey;

        await AzExtFsExtra.writeJSON(hostJsonPath, hostJson);
    }
}
