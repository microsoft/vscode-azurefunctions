/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LocationListStep, ResourceGroupCreateStep, ResourceGroupListStep, VerifyProvidersStep } from '@microsoft/vscode-azext-azureutils';
import { type AzureWizardExecuteStep, type AzureWizardPromptStep } from '@microsoft/vscode-azext-utils';
import { ConnectorNamespaceResourceType, webProvider } from '../../../constants';
import { AzureConnectorNamespaceClient, type ConnectorNamespaceClient } from './ConnectorNamespaceClient';
import { ConnectorNamespaceCreateStep } from './ConnectorNamespaceCreateStep';
import { ConnectorNamespaceNameStep } from './ConnectorNamespaceNameStep';
import { type IConnectorNamespaceWizardContext } from './IConnectorNamespaceWizardContext';

export function addConnectorNamespaceCreateSteps<T extends IConnectorNamespaceWizardContext>(
    context: T,
    promptSteps: AzureWizardPromptStep<T>[],
    executeSteps: AzureWizardExecuteStep<T>[],
    client: ConnectorNamespaceClient = new AzureConnectorNamespaceClient(),
): void {
    LocationListStep.addProviderForFiltering(context, webProvider, ConnectorNamespaceResourceType);

    promptSteps.push(new ResourceGroupListStep<T>());
    LocationListStep.addStep(context, promptSteps);
    promptSteps.push(new ConnectorNamespaceNameStep(client));

    executeSteps.push(
        new VerifyProvidersStep<T>([webProvider]),
        new ResourceGroupCreateStep<T>(),
        new ConnectorNamespaceCreateStep(client),
    );
}
