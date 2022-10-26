/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { ConnectionKey, ConnectionType, localEventHubsEmulatorConnectionRegExp, localEventHubsEmulatorConnectionStringDefault } from '../../constants';
import { getLocalConnectionString, MismatchBehavior, setLocalAppSetting } from '../../funcConfig/local.settings';
import { getEventHubsConnectionString } from '../../utils/azure';
import { IEventHubsConnectionWizardContext } from './IEventHubsConnectionWizardContext';

export class EventHubsConnectionExecuteStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 240;

    public constructor(private _setConnectionForDeploy?: boolean) {
        super();
    }

    public async execute(context: T): Promise<void> {
        let value: string;
        if (context.eventHubConnectionType === ConnectionType.NonAzure) {
            const currentConnection: string | undefined = await getLocalConnectionString(context, ConnectionKey.EventHub, context.projectPath);
            if (currentConnection && localEventHubsEmulatorConnectionRegExp.test(currentConnection)) {
                return;
            }
            value = localEventHubsEmulatorConnectionStringDefault;
        } else {
            value = (await getEventHubsConnectionString(<T & ISubscriptionContext>context)).connectionString;
        }

        if (this._setConnectionForDeploy) {
            context.eventHubConnectionForDeploy = value;
        } else {
            await setLocalAppSetting(context, context.projectPath, ConnectionKey.EventHub, value, MismatchBehavior.Overwrite);
        }
    }

    public shouldExecute(context: T): boolean {
        return !!context.eventHubConnectionType && context.eventHubConnectionType !== ConnectionType.None;
    }
}
