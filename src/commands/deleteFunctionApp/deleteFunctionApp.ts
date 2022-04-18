/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, IActionContext } from '@microsoft/vscode-azext-utils';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { ResolvedFunctionAppResource } from '../../tree/ResolvedFunctionAppResource';
import { SlotTreeItem } from '../../tree/SlotTreeItem';
import { createActivityContext } from '../../utils/activityUtils';
import { ConfirmDeleteStep } from './ConfirmDeletePromptStep';
import { FunctionAppDeleteStep } from './FunctionAppDeleteStep';
import { IDeleteWizardContext } from './IDeleteWizardContext';

export async function deleteFunctionApp(context: IActionContext, node?: SlotTreeItem): Promise<void> {
    if (!node) {
        node = await ext.rgApi.tree.showTreeItemPicker<SlotTreeItem>(new RegExp(ResolvedFunctionAppResource.productionContextValue), { ...context, suppressCreatePick: true });
    }

    const wizardContext: IDeleteWizardContext = {
        ...context,
        node,
        subscription: node.subscription,
        ...(await createActivityContext())
    };

    const wizard = new AzureWizard<IDeleteWizardContext>(wizardContext, {
        title: localize('deleteSwa', 'Delete Function App "{0}"', node.label),
        promptSteps: [new ConfirmDeleteStep()],
        executeSteps: [new FunctionAppDeleteStep()]
    });

    await wizard.prompt();
    await wizard.execute();
}

