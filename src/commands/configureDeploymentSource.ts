/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { editScmType } from '@microsoft/vscode-azext-azureappservice';
import { IActionContext } from '@microsoft/vscode-azext-utils';
import { ext } from '../extensionVariables';
import { ResolvedFunctionAppResource } from '../tree/ResolvedFunctionAppResource';
import { SlotTreeItem } from '../tree/SlotTreeItem';

export async function configureDeploymentSource(context: IActionContext, node?: SlotTreeItem): Promise<void> {
    if (!node) {
        node = await ext.rgApi.tree.showTreeItemPicker<SlotTreeItem>(new RegExp(ResolvedFunctionAppResource.productionContextValue), context);
    }

    const updatedScmType: string | undefined = await editScmType(context, node.site, node.subscription);
    if (updatedScmType !== undefined) {
        context.telemetry.properties.updatedScmType = updatedScmType;
    }
}
