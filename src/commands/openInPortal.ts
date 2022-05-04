/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { openInPortal as uiOpenInPortal } from '@microsoft/vscode-azext-azureutils';
import { AzExtTreeItem, IActionContext, nonNullProp } from '@microsoft/vscode-azext-utils';

export async function openDeploymentInPortal(_context: IActionContext, node: AzExtTreeItem): Promise<void> {
    await uiOpenInPortal(node, `${nonNullProp(node, 'parent').parent?.id}/Deployments/${nonNullProp(node, 'id')}`);
}
