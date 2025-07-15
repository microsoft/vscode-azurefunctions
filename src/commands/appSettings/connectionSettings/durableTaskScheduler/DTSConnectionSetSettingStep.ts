/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullProp } from '@microsoft/vscode-azext-utils';
import { ConnectionKey } from '../../../../constants';
import { clientIdKey } from '../../../durableTaskScheduler/copySchedulerConnectionString';
import { SetConnectionSettingStepBase } from '../SetConnectionSettingStepBase';
import { type IDTSAzureConnectionWizardContext, type IDTSConnectionWizardContext } from './IDTSConnectionWizardContext';

export class DTSConnectionSetSettingStep<T extends IDTSConnectionWizardContext | IDTSAzureConnectionWizardContext> extends SetConnectionSettingStepBase<T> {
    public priority: number = 240;
    public debugDeploySetting: ConnectionKey = ConnectionKey.DTS;

    public async execute(context: T): Promise<void> {
        let newDTSConnectionSetting = nonNullProp(context, 'newDTSConnectionSetting');
        if ((context as IDTSAzureConnectionWizardContext).managedIdentity) {
            newDTSConnectionSetting = newDTSConnectionSetting.replace(clientIdKey, (context as IDTSAzureConnectionWizardContext).managedIdentity?.clientId ?? clientIdKey);
        }
        await this.setConnectionSetting(context, newDTSConnectionSetting);
    }

    public shouldExecute(context: T): boolean {
        return !!context.newDTSConnectionSetting;
    }
}
