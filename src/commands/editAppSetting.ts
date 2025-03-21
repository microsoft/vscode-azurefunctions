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
import { getEOLMessage, shouldShowEolWarning } from './createFunctionApp/stacks/getStackPicks';

export async function editAppSetting(context: IFunctionAppWizardContext, node?: AppSettingTreeItem): Promise<void> {
    if (!node) {
        node = await ext.rgApi.pickAppResource<AppSettingTreeItem>(context, {
            filter: functionFilter,
            expectedChildContextValue: new RegExp(AppSettingTreeItem.contextValue)
        });
    }
    const parent = node.parent.parent;

    if (isResolvedFunctionApp(parent)) {
        const client = await node.parent.clientProvider.createClient(context);
        const eolWarning = await shouldShowEolWarning(context, parent.site.rawSite, client.isLinux, parent.isFlex, client);
        if (eolWarning && (eolWarning.isEOL || eolWarning.willBeEOL)) {
            const message: string = getEOLMessage(eolWarning);
            const continueOn: MessageItem = { title: localize('continueOn', 'Continue') };
            await context.ui.showWarningMessage(message, { modal: true }, continueOn);
        }
    }
    await node.edit(context);
}
