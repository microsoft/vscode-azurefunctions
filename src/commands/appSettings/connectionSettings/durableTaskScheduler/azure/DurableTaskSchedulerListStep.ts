/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommonRoleDefinitions, createAuthorizationManagementClient, createRoleId, LocationListStep, parseAzureResourceId, RoleAssignmentExecuteStep, uiUtils, type ILocationWizardContext, type Role } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, nonNullProp, type AzureWizardExecuteStep, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { localSettingsDescription } from '../../../../../constants-nls';
import { localize } from '../../../../../localize';
import { HttpDurableTaskSchedulerClient, type DurableTaskSchedulerClient, type DurableTaskSchedulerResource } from '../../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient';
import { FunctionAppUserAssignedIdentitiesListStep } from '../../../../identity/FunctionAppUserAssignedIdentitiesListStep';
import { type IDTSAzureConnectionWizardContext } from '../IDTSConnectionWizardContext';
import { DurableTaskHubListStep } from './DurableTaskHubListStep';
import { DurableTaskSchedulerCreateStep } from './DurableTaskSchedulerCreateStep';
import { DurableTaskSchedulerNameStep } from './DurableTaskSchedulerNameStep';

export class DurableTaskSchedulerListStep<T extends IDTSAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private readonly _schedulerClient: DurableTaskSchedulerClient;

    constructor(schedulerClient?: DurableTaskSchedulerClient) {
        super();
        this._schedulerClient = schedulerClient ?? new HttpDurableTaskSchedulerClient();
    }

    public async prompt(context: T): Promise<void> {
        context.dts = (await context.ui.showQuickPick(await this.getPicks(context), {
            placeHolder: localize('selectTaskScheduler', 'Select a durable task scheduler'),
        })).data;

        if (context.dts) {
            context.valuesToMask.push(context.dts.name);
        }

        context.telemetry.properties.usedLocalDTSConnectionSettings = context.suggestedDTSEndpointLocalSettings ? String(context.dts?.properties.endpoint === context.suggestedDTSEndpointLocalSettings) : undefined;
    }

    public shouldPrompt(context: T): boolean {
        return !context.dts;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        const promptSteps: AzureWizardPromptStep<T>[] = [];
        const executeSteps: AzureWizardExecuteStep<T>[] = [];

        if (!context.dts) {
            promptSteps.push(new DurableTaskSchedulerNameStep(this._schedulerClient));
            executeSteps.push(new DurableTaskSchedulerCreateStep(this._schedulerClient));
            LocationListStep.addStep(context, promptSteps as AzureWizardPromptStep<ILocationWizardContext>[]);
        }

        if (!context.dtsHub) {
            promptSteps.push(new DurableTaskHubListStep(this._schedulerClient));
        }

        const dtsContributorRole: Role = {
            scopeId: context.dtsHub?.id,
            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.durableTaskDataContributor),
            roleDefinitionName: CommonRoleDefinitions.durableTaskDataContributor.roleName,
        };

        promptSteps.push(new FunctionAppUserAssignedIdentitiesListStep(dtsContributorRole /** targetRole */, { identityAssignStepPriority: 180 }));
        executeSteps.push(new RoleAssignmentExecuteStep(getDTSRoleAssignmentCallback(context, dtsContributorRole), { priority: 190 }));

        return { promptSteps, executeSteps };

        function getDTSRoleAssignmentCallback(context: T, role: Role): () => Promise<Role[]> {
            return async () => {
                const roleAssignment: Role = {
                    ...role,
                    // This id may be missing when the role is initially passed in,
                    // but by the time we run the step, we should have the populated id ready.
                    scopeId: context.dtsHub?.id,
                };

                if (!roleAssignment.scopeId) {
                    return [];
                }

                const amClient = await createAuthorizationManagementClient(context);
                const roleAssignments = await uiUtils.listAllIterator(amClient.roleAssignments.listForScope(
                    roleAssignment.scopeId,
                    {
                        // $filter=principalId eq {id}
                        filter: `principalId eq '{${context.managedIdentity?.principalId}}'`,
                    }
                ));

                const hasRoleAssignment = roleAssignments.some(r => !!r.roleDefinitionId?.endsWith(role.roleDefinitionId));
                return hasRoleAssignment ? [] : [roleAssignment];
            };
        }
    }

    private async getPicks(context: T): Promise<IAzureQuickPickItem<DurableTaskSchedulerResource | undefined>[]> {
        const schedulers: DurableTaskSchedulerResource[] = await this._schedulerClient.getSchedulersBySubscription(nonNullProp(context, 'subscription'));

        const createPick = {
            label: localize('createTaskScheduler', '$(plus) Create new durable task scheduler'),
            data: undefined,
        };

        return [
            createPick,
            ...schedulers.map(s => {
                const resourceGroupName: string = parseAzureResourceId(s.id).resourceGroup;
                return {
                    label: s.name,
                    description: s.properties.endpoint === context.suggestedDTSEndpointLocalSettings ?
                        `${resourceGroupName} ${localSettingsDescription}` :
                        resourceGroupName,
                    data: s,
                };
            }),
        ];
    }
}
