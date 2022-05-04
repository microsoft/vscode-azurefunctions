/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { openInPortal as uiOpenInPortal } from '@microsoft/vscode-azext-azureutils';
import { AzExtTreeItem, IActionContext, nonNullProp } from '@microsoft/vscode-azext-utils';
import { functionFilter } from '../constants';
import { ext } from '../extensionVariables';
import { ResolvedFunctionAppResource } from '../tree/ResolvedFunctionAppResource';

export async function openDeploymentInPortal(context: IActionContext, node?: AzExtTreeItem): Promise<void> {
    if (!node) {
        node = await ext.rgApi.pickAppResource<AzExtTreeItem>(context, {
            filter: functionFilter,
            expectedChildContextValue: new RegExp(ResolvedFunctionAppResource.productionContextValue)
        });
    }

    await uiOpenInPortal(node, `${nonNullProp(node, 'parent').parent?.id}/Deployments/${nonNullProp(node, 'id')}`);
}
