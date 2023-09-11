/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { ConnectionKey, ConnectionKeyValues, ConnectionType, localEventHubsEmulatorConnectionRegExp, localEventHubsEmulatorConnectionStringDefault } from '../../../../constants';
import { getLocalSettingsConnectionString } from '../../../../funcConfig/local.settings';
import { SetConnectionSettingStepBase } from '../SetConnectionSettingStepBase';
import { getEventHubsConnectionString } from '../getLocalConnectionSetting';
import { IEventHubsConnectionWizardContext } from './IEventHubsConnectionWizardContext';

export class EventHubsConnectionExecuteStep<T extends IEventHubsConnectionWizardContext> extends SetConnectionSettingStepBase<T> {
    public priority: number = 240;
    public debugDeploySetting: ConnectionKeyValues = ConnectionKey.EventHubs;

    public async execute(context: T): Promise<void> {
        let value: string;

        if (context.eventHubsConnectionType === ConnectionType.Emulator) {
            const currentConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.EventHubs, context.projectPath);
            if (currentConnection && localEventHubsEmulatorConnectionRegExp.test(currentConnection)) {
                return;
            }
            value = localEventHubsEmulatorConnectionStringDefault;
        } else {
            value = (await getEventHubsConnectionString(<T & ISubscriptionContext>context)).connectionString;
        }

        await this.setConnectionSetting(context, value);
    }

    public shouldExecute(context: T): boolean {
        return !!context.eventHubsConnectionType;
    }
}
