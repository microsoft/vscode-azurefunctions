/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppSettingTreeItem } from '@microsoft/vscode-azext-azureappsettings';
import { nonNullValue } from '@microsoft/vscode-azext-utils';
import { functionFilter } from '../constants';
import { ext } from '../extensionVariables';
import { type IFunctionAppWizardContext } from './createFunctionApp/IFunctionAppWizardContext';
import { showEolWarningIfNecessary } from './createFunctionApp/stacks/getStackPicks';

export async function editAppSetting(context: IFunctionAppWizardContext, node?: AppSettingTreeItem): Promise<void> {
    if (!node) {
        node = await ext.rgApi.pickAppResource<AppSettingTreeItem>(context, {
            filter: functionFilter,
            expectedChildContextValue: new RegExp(AppSettingTreeItem.contextValue)
        });
    }
    const parent = node.parent.parent;
    await showEolWarningIfNecessary(context, nonNullValue(parent))
    await node.edit(context);
}
