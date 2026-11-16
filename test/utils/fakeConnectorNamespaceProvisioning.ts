/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceGroupCreateStep } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardExecuteStep, nonNullProp, type ExecuteActivityContext } from '@microsoft/vscode-azext-utils';
import { type OnErrorActivityData, type OnSuccessActivityData } from '@microsoft/vscode-azext-utils/hostapi';
import { type ConnectorNamespacePrerequisiteStepsFactory } from '../../src/debug/connectorNamespace/AzureConnectorTriggerF5Adapters';
import { type ConnectorNamespaceProvisionContext } from '../../src/debug/connectorNamespace/ConnectorNamespaceProvisionStep';

export interface RecordedActivity {
    hasChildren?: boolean;
    success?: OnSuccessActivityData;
    failure?: OnErrorActivityData;
}

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

class FakeResourceGroupCreateStep extends ResourceGroupCreateStep<ConnectorNamespaceProvisionContext> {
    public constructor(private readonly onCreate?: (name: string) => void) {
        super();
    }

    public async configureBeforeExecute(context: ConnectorNamespaceProvisionContext): Promise<void> {
        context._lastResourceGroupNameVerified = context.newResourceGroupName;
        await super.configureBeforeExecute(context);
    }

    public async execute(context: ConnectorNamespaceProvisionContext): Promise<void> {
        const name = nonNullProp(context, 'newResourceGroupName');
        this.onCreate?.(name);
        context.resourceGroup = { name, location: context.connectorNamespaceRegion };
    }
}

/**
 * Avoids Azure calls while preserving the resource group's real wizard output and execution condition.
 */
export function fakeConnectorNamespacePrerequisiteSteps(callbacks: {
    onProviderCheck?: () => void;
    onResourceGroupCreate?: (name: string) => void;
} = {}): ConnectorNamespacePrerequisiteStepsFactory {
    return async () => [
        new FakeStep(90, () => callbacks.onProviderCheck?.()),
        new FakeResourceGroupCreateStep(callbacks.onResourceGroupCreate),
    ];
}

export function fakeActivityContextFactory(
    activityTitles: string[] = [],
    activities: RecordedActivity[] = [],
): (options?: { withChildren?: boolean }) => Promise<ExecuteActivityContext> {
    return async options => ({
        registerActivity: async activity => {
            const recorded: RecordedActivity = { hasChildren: activity.hasChildren };
            activities.push(recorded);
            activity.onStart(data => { activityTitles.push(data.label); });
            activity.onSuccess(data => { recorded.success = data; });
            activity.onError(data => { recorded.failure = data; });
        },
        activityChildren: options?.withChildren ? [] : undefined,
    });
}
