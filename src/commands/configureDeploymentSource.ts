/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { editScmType } from '@microsoft/vscode-azext-azureappservice';
import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { type SlotTreeItem } from '../tree/SlotTreeItem';
import { pickFunctionApp } from '../utils/pickFunctionApp';

export async function configureDeploymentSource(context: IActionContext, node?: SlotTreeItem): Promise<void> {
    if (!node) {
        node = await pickFunctionApp(context);
    }

    await node.initSite(context);
    const updatedScmType: string | undefined = await editScmType(context, node.site, node.subscription);
    if (updatedScmType !== undefined) {
        context.telemetry.properties.updatedScmType = updatedScmType;
    }
}
