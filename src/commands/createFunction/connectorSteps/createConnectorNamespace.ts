/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, createSubscriptionContext, subscriptionExperience, type AzureWizardExecuteStep, type AzureWizardPromptStep, type IActionContext } from '@microsoft/vscode-azext-utils';
import { ext } from '../../../extensionVariables';
import { localize } from '../../../localize';
import { createActivityContext } from '../../../utils/activityUtils';
import { addConnectorNamespaceCreateSteps } from './addConnectorNamespaceCreateSteps';
import { type IConnectorNamespaceWizardContext } from './IConnectorNamespaceWizardContext';

export async function createConnectorNamespace(
    context: IActionContext,
): Promise<IConnectorNamespaceWizardContext> {
    const wizardContext: IConnectorNamespaceWizardContext = {
        ...context,
        ...createSubscriptionContext(await subscriptionExperience(
            context,
            ext.rgApiV2.resources.azureResourceTreeDataProvider,
        )),
        ...await createActivityContext(),
    };
    const promptSteps: AzureWizardPromptStep<IConnectorNamespaceWizardContext>[] = [];
    const executeSteps: AzureWizardExecuteStep<IConnectorNamespaceWizardContext>[] = [];
    addConnectorNamespaceCreateSteps(wizardContext, promptSteps, executeSteps);

    const wizard = new AzureWizard(wizardContext, {
        title: localize('createConnectorNamespace', 'Create Connector Namespace'),
        promptSteps,
        executeSteps,
        showLoadingPrompt: true,
    });
    await wizard.prompt();
    await wizard.execute();
    return wizardContext;
}
