/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppSettingTreeItem } from '@microsoft/vscode-azext-azureappsettings';
import { functionFilter } from '../constants';
import { ext } from '../extensionVariables';
import { ResolvedFunctionAppResource } from '../tree/ResolvedFunctionAppResource';
import { type IFunctionAppWizardContext } from './createFunctionApp/IFunctionAppWizardContext';
import { shouldShowEolWarning } from './createFunctionApp/stacks/getStackPicks';

export async function editAppSetting(context: IFunctionAppWizardContext, node?: AppSettingTreeItem): Promise<void> {
    if (!node) {
        node = await ext.rgApi.pickAppResource<AppSettingTreeItem>(context, {
            filter: functionFilter,
            expectedChildContextValue: new RegExp(AppSettingTreeItem.contextValue)
        });
    }
    const parent = node.parent.parent;


    if (isResolvedFunction(parent)) {
        const client = await node.parent.clientProvider.createClient(context);
        if (await shouldShowEolWarning(context, client.isLinux, parent.site.rawSite)) {
            //show warning
        }
    }
    await node.edit(context);
}

export function isResolvedFunction(ti: unknown): ti is ResolvedFunctionAppResource {
    return (ti as unknown as ResolvedFunctionAppResource).instance === ResolvedFunctionAppResource.instance;
}

