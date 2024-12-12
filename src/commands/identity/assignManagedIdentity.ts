/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UserAssignedIdentityListStep } from '@microsoft/vscode-azext-azureutils';
import { AzureWizard, type AzureWizardExecuteStep, type AzureWizardPromptStep, type IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { type SlotTreeItem } from '../../tree/SlotTreeItem';
import { pickFunctionApp } from '../../utils/pickFunctionApp';
import { type ManagedIdentityAssignContext } from './ManagedIdentityAssignContext';
import { ManagedIdentityAssignStep } from './ManagedIdentityAssignStep';

export async function assignManagedIdentity(context: IActionContext, node?: SlotTreeItem): Promise<SlotTreeItem> {
    const title: string = localize('assignManagedIdentity', 'Assign Managed Identity to Function App');

    if (!node) {
        node = await pickFunctionApp(context);
    }

    const wizardContext: ManagedIdentityAssignContext = {
        ...context,
        site: node.site,
    }


    const promptSteps: AzureWizardPromptStep<ManagedIdentityAssignContext>[] = [
        new UserAssignedIdentityListStep()
    ];

    const executeSteps: AzureWizardExecuteStep<ManagedIdentityAssignContext>[] = [
        new ManagedIdentityAssignStep()
    ];

    // const executeSteps: AzureWizardExecuteStep<EventGridExecuteFunctionContext>[] = [
    //     new EventGridFileOpenStep(),
    // ];

    // const wizardContext: EventGridExecuteFunctionContext = {
    //     ...context,
    //     eventSource: undefined,
    //     selectedFileName: undefined,
    //     selectedFileUrl: undefined,
    //     fileOpened: false,
    // };

    const wizard: AzureWizard<ManagedIdentityAssignContext> = new AzureWizard(wizardContext, {
        title,
        promptSteps,
        executeSteps,
        showLoadingPrompt: true,
    });

    await wizard.prompt();
    await wizard.execute();

    return node;
}
