/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppSettingTreeItem } from '@microsoft/vscode-azext-azureappsettings';
import { type MessageItem } from 'vscode';
import { functionFilter } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { isResolvedFunctionApp } from '../tree/ResolvedFunctionAppResource';
import { type IFunctionAppWizardContext } from './createFunctionApp/IFunctionAppWizardContext';
import { getEolWarningMessages } from './createFunctionApp/stacks/getStackPicks';

export async function renameAppSetting(context: IFunctionAppWizardContext, node?: AppSettingTreeItem): Promise<void> {
    if (!node) {
        node = await ext.rgApi.pickAppResource<AppSettingTreeItem>(context, {
            filter: functionFilter,
            expectedChildContextValue: new RegExp(AppSettingTreeItem.contextValue)
        });
    }

    const parent = node.parent.parent;

    if (isResolvedFunctionApp(parent)) {
        const client = await node.parent.clientProvider.createClient(context);
        const eolWarningMessage = await getEolWarningMessages(context, parent.site.rawSite, client.isLinux, parent.isFlex, client);
        const continueOn: MessageItem = { title: localize('continueOn', 'Continue') };
        await context.ui.showWarningMessage(eolWarningMessage, { modal: true }, continueOn);
    }
    await node.rename(context);
}
