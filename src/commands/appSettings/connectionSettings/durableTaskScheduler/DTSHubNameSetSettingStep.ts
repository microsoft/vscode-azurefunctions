/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStepWithActivityOutput, nonNullProp } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../localize';
import { setConnectionSetting } from '../setConnectionSetting';
import { type IDTSConnectionWizardContext } from './IDTSConnectionWizardContext';

export class DTSHubNameSetSettingStep<T extends IDTSConnectionWizardContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    public priority: number = 241;
    public stepName: string = 'dtsHubNameSetSettingStep';

    protected getOutputLogSuccess = (context: T) => localize('prepareDTSHubNameSuccess', 'Successfully prepared DTS hub connection: "{0}".', context.newDTSHubConnectionSettingValue);
    protected getOutputLogFail = (context: T) => localize('prepareDTSHubNameFail', 'Failed to prepare DTS hub connection: "{0}".', context.newDTSHubConnectionSettingValue);
    protected getTreeItemLabel = (context: T) => localize('prepareDTSHubNameLabel', 'Prepare DTS hub connection: "{0}"', context.newDTSHubConnectionSettingValue);

    public async execute(context: T): Promise<void> {
        await setConnectionSetting(context, nonNullProp(context, 'newDTSHubConnectionSettingKey'), nonNullProp(context, 'newDTSHubConnectionSettingValue'));
    }

    public shouldExecute(context: T): boolean {
        return !!context.newDTSHubConnectionSettingKey && !!context.newDTSHubConnectionSettingValue;
    }
}
