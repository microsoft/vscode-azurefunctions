/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullProp } from '@microsoft/vscode-azext-utils';
import { ConnectionKey } from '../../../../constants';
import { SetConnectionSettingStepBase } from '../SetConnectionSettingStepBase';
import { type IDTSConnectionWizardContext } from './IDTSConnectionWizardContext';

export class DTSHubNameSetSettingStep<T extends IDTSConnectionWizardContext> extends SetConnectionSettingStepBase<T> {
    public priority: number = 241;
    public debugDeploySetting: ConnectionKey = ConnectionKey.DTSHub;

    public async execute(context: T): Promise<void> {
        await this.setConnectionSetting(context, nonNullProp(context, 'newDTSHubNameConnectionSetting'));
    }

    public shouldExecute(context: T): boolean {
        return !!context.newDTSHubNameConnectionSetting;
    }
}
