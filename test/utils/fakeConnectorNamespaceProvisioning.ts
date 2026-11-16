/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, type ExecuteActivityContext } from '@microsoft/vscode-azext-utils';
import { type ConnectorNamespacePrerequisiteStepsFactory } from '../../src/debug/connectorNamespace/AzureConnectorTriggerF5Adapters';
import { type ConnectorNamespaceProvisionContext } from '../../src/debug/connectorNamespace/ConnectorNamespaceProvisionStep';

class FakeStep extends AzureWizardExecuteStep<ConnectorNamespaceProvisionContext> {
    public constructor(
        public priority: number,
        private readonly run: (context: ConnectorNamespaceProvisionContext) => void,
        private readonly shouldRun: (context: ConnectorNamespaceProvisionContext) => boolean = () => true,
    ) {
        super();
    }

    public async execute(context: ConnectorNamespaceProvisionContext): Promise<void> {
        this.run(context);
    }

    public shouldExecute(context: ConnectorNamespaceProvisionContext): boolean {
        return this.shouldRun(context);
    }
}

/**
 * Replaces VerifyProvidersStep and ResourceGroupCreateStep, keeping their priorities and
 * ResourceGroupCreateStep's "only when no resource group was resolved" condition.
 */
export function fakeConnectorNamespacePrerequisiteSteps(callbacks: {
    onProviderCheck?: () => void;
    onResourceGroupCreate?: (name: string) => void;
} = {}): ConnectorNamespacePrerequisiteStepsFactory {
    return async () => [
        new FakeStep(90, () => callbacks.onProviderCheck?.()),
        new FakeStep(100, context => {
            const name = context.newResourceGroupName ?? '';
            callbacks.onResourceGroupCreate?.(name);
            context.resourceGroup = { name, location: context.connectorNamespaceRegion };
        }, context => !context.resourceGroup),
    ];
}

export function fakeActivityContextFactory(activityTitles: string[] = []): () => Promise<ExecuteActivityContext> {
    return async () => ({
        // AzureWizard registers an ExecuteActivity, whose label is the context's activityTitle.
        registerActivity: async activity => { activityTitles.push((activity as unknown as { label: string }).label); },
    } as ExecuteActivityContext);
}
