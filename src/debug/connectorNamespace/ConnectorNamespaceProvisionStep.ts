/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IResourceGroupWizardContext } from '@microsoft/vscode-azext-azureutils';
import {
    AzureWizardExecuteStepWithActivityOutput,
    nonNullValueAndProp,
    UserCancelledError,
    type ExecuteActivityContext,
} from '@microsoft/vscode-azext-utils';
import { type CancellationToken, type Progress } from 'vscode';
import { type ConnectorGatewayClient } from '../../commands/createFunction/connectorSteps/ConnectorGatewayClient';
import { type ConnectorGatewayResource } from '../../commands/createFunction/connectorSteps/ConnectorGatewayModels';
import { getStatusCode } from '../../connectorTrigger/connectorTriggerUtils';
import { localize } from '../../localize';

export interface ConnectorNamespaceProvisionContext extends IResourceGroupWizardContext, ExecuteActivityContext {
    newConnectorNamespaceName: string;
    connectorNamespaceRegion: string;
    setupCancellationToken?: CancellationToken;
    connectorNamespace?: ConnectorGatewayResource;
}

/**
 * Creates the Connector Namespace with If-None-Match. A namespace created concurrently by another
 * setup surfaces as a conflict or failed precondition and is adopted; any other failure is rethrown.
 */
export class ConnectorNamespaceProvisionStep extends AzureWizardExecuteStepWithActivityOutput<ConnectorNamespaceProvisionContext> {
    public priority: number = 140;
    public stepName: string = 'connectorNamespaceProvisionStep';

    protected getOutputLogSuccess = (context: ConnectorNamespaceProvisionContext) =>
        localize('connectorNamespaceCreated', 'Successfully created Connector Namespace "{0}".', context.newConnectorNamespaceName);
    protected getOutputLogFail = (context: ConnectorNamespaceProvisionContext) =>
        localize('connectorNamespaceCreateFailed', 'Failed to create Connector Namespace "{0}".', context.newConnectorNamespaceName);
    protected getTreeItemLabel = (context: ConnectorNamespaceProvisionContext) =>
        localize('connectorNamespaceCreateLabel', 'Create Connector Namespace "{0}"', context.newConnectorNamespaceName);

    public constructor(private readonly client: ConnectorGatewayClient) {
        super();
    }

    public async execute(
        context: ConnectorNamespaceProvisionContext,
        progress: Progress<{ message?: string; increment?: number }>,
    ): Promise<void> {
        const cancellationToken = context.setupCancellationToken;
        if (cancellationToken?.isCancellationRequested) {
            throw new UserCancelledError('connectorF5Setup');
        }
        progress.report({ message: localize('creatingConnectorNamespace', 'Creating Connector Namespace...') });
        const resourceGroupName = nonNullValueAndProp(context.resourceGroup, 'name');
        try {
            context.connectorNamespace = await this.client.createNamespace(
                context,
                resourceGroupName,
                context.newConnectorNamespaceName,
                {
                    location: context.connectorNamespaceRegion,
                    identity: { type: 'SystemAssigned' },
                    properties: {},
                },
                { cancellationToken },
            );
        } catch (error) {
            const statusCode = getStatusCode(error);
            if (statusCode !== 409 && statusCode !== 412) {
                throw error;
            }
            context.telemetry.properties.connectorF5NamespaceCreateConflict = 'true';
            const concurrentlyCreated = await this.client.getNamespace(
                context,
                resourceGroupName,
                context.newConnectorNamespaceName,
                { cancellationToken },
            );
            if (!concurrentlyCreated) {
                throw error;
            }
            context.connectorNamespace = concurrentlyCreated;
        }
    }

    public shouldExecute(context: ConnectorNamespaceProvisionContext): boolean {
        return !context.connectorNamespace;
    }
}
