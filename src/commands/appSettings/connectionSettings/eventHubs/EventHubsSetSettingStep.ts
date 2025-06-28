/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, type ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { ConnectionKey, ConnectionType, localEventHubsEmulatorConnectionRegExp, localEventHubsEmulatorConnectionString } from '../../../../constants';
import { getLocalSettingsConnectionString } from '../../../../funcConfig/local.settings';
import { getEventHubsConnectionString } from '../getLocalConnectionSetting';
import { setConnectionSetting } from '../setConnectionSetting';
import { type IEventHubsConnectionWizardContext } from './IEventHubsConnectionWizardContext';

export class EventHubsSetSettingStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 240;

    public async execute(context: T): Promise<void> {
        let value: string;

        if (context.eventHubsConnectionType === ConnectionType.Emulator) {
            const currentConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.EventHubs, context.projectPath);
            if (currentConnection && localEventHubsEmulatorConnectionRegExp.test(currentConnection)) {
                return;
            }
            value = localEventHubsEmulatorConnectionString;
        } else {
            value = (await getEventHubsConnectionString(<T & ISubscriptionContext>context)).connectionString;
        }

        // Todo: set
        await setConnectionSetting(context, value);
    }

    public shouldExecute(context: T): boolean {
        return !!context.eventHubsConnectionType;
    }
}
