/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window } from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { FuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { FunctionTreeItemBase } from '../tree/FunctionTreeItemBase';

export async function enableFunction(context: IActionContext, node?: FunctionTreeItemBase): Promise<void> {
    await updateDisabledState(context, node, false);
}

export async function disableFunction(context: IActionContext, node?: FunctionTreeItemBase): Promise<void> {
    await updateDisabledState(context, node, true);
}

async function updateDisabledState(context: IActionContext, node: FunctionTreeItemBase | undefined, isDisabled: boolean): Promise<void> {
    if (!node) {
        const expectedContextValue: RegExp = new RegExp(`Function;.*;${isDisabled ? 'Enabled' : 'Disabled'};`);
        const noItemFoundErrorMessage: string = isDisabled ? localize('noEnabledFuncs', 'No enabled functions found.') : localize('noDisabledFuncs', 'No disabled functions found.');
        node = await ext.tree.showTreeItemPicker<FunctionTreeItemBase>(expectedContextValue, { ...context, noItemFoundErrorMessage });
    }

    const version: FuncVersion = await node.parent.parent.getVersion();
    if (version === FuncVersion.v1) {
        throw new Error(localize('notSupportedV1', 'This operation is not supported for Azure Functions v1.'));
    } else {
        await node.parent.parent.setApplicationSetting(context, node.disabledStateKey, String(isDisabled));
    }
    await node.parent.parent.refresh(context);

    const message: string = isDisabled ? localize('disabledFunction', 'Disabled function "{0}".', node.name) : localize('enabledFunction', 'Enabled function "{0}".', node.name);
    // don't wait
    void window.showInformationMessage(message);
    ext.outputChannel.appendLog(message, { resourceName: node.parent.parent.label });
}
