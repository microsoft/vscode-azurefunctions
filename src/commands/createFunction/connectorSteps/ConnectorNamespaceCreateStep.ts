/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LocationListStep } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStepWithActivityOutput, nonNullProp, nonNullValueAndProp } from '@microsoft/vscode-azext-utils';
import { type Progress } from 'vscode';
import { localize } from '../../../localize';
import { AzureConnectorNamespaceClient, type ConnectorNamespaceClient } from './ConnectorNamespaceClient';
import { type IConnectorNamespaceWizardContext } from './IConnectorNamespaceWizardContext';

export class ConnectorNamespaceCreateStep<T extends IConnectorNamespaceWizardContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    public priority: number = 110;
    public stepName: string = 'connectorNamespaceCreateStep';

    private readonly _client: ConnectorNamespaceClient;

    public constructor(client: ConnectorNamespaceClient = new AzureConnectorNamespaceClient()) {
        super();
        this._client = client;
    }

    protected getTreeItemLabel = (context: T) => localize('createConnectorNamespaceLabel', 'Create connector namespace "{0}"', context.newConnectorNamespaceName);
    protected getOutputLogSuccess = (context: T) => localize('createConnectorNamespaceSuccess', 'Successfully created connector namespace "{0}".', context.newConnectorNamespaceName);
    protected getOutputLogFail = (context: T) => localize('createConnectorNamespaceFail', 'Failed to create connector namespace "{0}".', context.newConnectorNamespaceName);

    public async execute(context: T, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        progress.report({ message: localize('creatingConnectorNamespace', 'Creating connector namespace...') });

        const namespaceName = nonNullProp(context, 'newConnectorNamespaceName');
        if (!context.valuesToMask.includes(namespaceName)) {
            context.valuesToMask.push(namespaceName);
        }

        context.connectorNamespace = await this._client.create(
            context,
            context.newResourceGroupName ?? nonNullValueAndProp(context.resourceGroup, 'name'),
            namespaceName,
            nonNullProp(await LocationListStep.getLocation(context), 'name'),
        );
    }

    public shouldExecute(context: T): boolean {
        return !context.connectorNamespace;
    }
}
