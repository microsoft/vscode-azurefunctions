/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, nonNullProp } from '@microsoft/vscode-azext-utils';
import { setConnectionSetting } from '../setConnectionSetting';
import { type INetheriteConnectionWizardContext } from './INetheriteConnectionWizardContext';

export class EventHubsNamespaceSetSettingStep<T extends INetheriteConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 240;

    public async execute(context: T): Promise<void> {
        await setConnectionSetting(
            context,
            nonNullProp(context, 'newEventHubsNamespaceConnectionSettingKey'),
            nonNullProp(context, 'newEventHubsNamespaceConnectionSettingValue'),
        );

        context.valuesToMask.push(context.newDTSConnectionSettingValue as string);
    }

    public shouldExecute(context: T): boolean {
        return !!context.newEventHubsNamespaceConnectionSettingKey && !!context.newEventHubsNamespaceConnectionSettingValue;
    }
}
