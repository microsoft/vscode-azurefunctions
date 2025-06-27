/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStepWithActivityOutput, nonNullProp } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../../localize';
import { setConnectionSetting } from '../setConnectionSetting';
import { type IDTSAzureConnectionWizardContext, type IDTSConnectionWizardContext } from './IDTSConnectionWizardContext';

export class DTSConnectionSetSettingStep<T extends IDTSConnectionWizardContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    public priority: number = 240;
    public stepName: string = 'dtsConnectionSetSettingStep';

    protected getOutputLogSuccess = (context: T) => localize('prepareDTSConnectionSuccess', 'Successfully prepared DTS connection: "{0}".', context.newDTSConnectionSettingValue);
    protected getOutputLogFail = (context: T) => localize('prepareDTSConnectionFail', 'Failed to prepare DTS connection: "{0}".', context.newDTSConnectionSettingValue);
    protected getTreeItemLabel = () => localize('prepareDTSConnectionLabel', 'Prepare DTS connection: "{0}"', 'Endpoint=...');

    public async execute(context: T): Promise<void> {
        const newDTSConnectionSettingKey = nonNullProp(context, 'newDTSConnectionSettingKey');
        let newDTSConnectionSettingValue = nonNullProp(context, 'newDTSConnectionSettingValue');

        if ((context as unknown as IDTSAzureConnectionWizardContext).managedIdentity) {
            newDTSConnectionSettingValue = newDTSConnectionSettingValue.replace('<ClientID>', (context as unknown as IDTSAzureConnectionWizardContext).managedIdentity?.clientId ?? '');
        }

        await setConnectionSetting(context, newDTSConnectionSettingKey, newDTSConnectionSettingValue);

        context.newDTSConnectionSettingValue = newDTSConnectionSettingValue;
        context.valuesToMask.push(context.newDTSConnectionSettingValue);
    }

    public shouldExecute(context: T): boolean {
        return !!context.newDTSConnectionSettingKey && !!context.newDTSConnectionSettingValue;
    }
}
