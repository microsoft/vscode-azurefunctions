/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommonRoleDefinitions, createAuthorizationManagementClient, createRoleId, parseAzureResourceId, RoleAssignmentExecuteStep, uiUtils, type Role } from '@microsoft/vscode-azext-azureutils';
import { ActivityChildItem, ActivityChildType, activitySuccessContext, activitySuccessIcon, AzureWizardPromptStep, createContextValue, nonNullProp, type AzureWizardExecuteStep, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { localSettingsDescription } from '../../../../../constants-nls';
import { ext } from '../../../../../extensionVariables';
import { localize } from '../../../../../localize';
import { HttpDurableTaskSchedulerClient, type DurableTaskHubResource, type DurableTaskSchedulerClient } from '../../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient';
import { FunctionAppUserAssignedIdentitiesListStep } from '../../../../identity/FunctionAppUserAssignedIdentitiesListStep';
import { type IDTSAzureConnectionWizardContext } from '../IDTSConnectionWizardContext';
import { DurableTaskHubCreateStep } from './DurableTaskHubCreateStep';
import { DurableTaskHubNameStep } from './DurableTaskHubNameStep';

export class DurableTaskHubListStep<T extends IDTSAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    private readonly schedulerClient: DurableTaskSchedulerClient;

    constructor(schedulerClient?: DurableTaskSchedulerClient) {
        super();
        this.schedulerClient = schedulerClient ?? new HttpDurableTaskSchedulerClient();
    }

    public async prompt(context: T): Promise<void> {
        context.dtsHub = (await context.ui.showQuickPick(await this.getPicks(context), {
            placeHolder: localize('selectTaskScheduler', 'Select a durable task hub'),
        })).data;

        if (context.dtsHub) {
            context.newDTSHubConnectionSettingValue = context.dtsHub.name;
            context.valuesToMask.push(context.dtsHub.name);
        }
    }

    public shouldPrompt(context: T): boolean {
        return !context.dtsHub;
    }

    private async getPicks(context: T): Promise<IAzureQuickPickItem<DurableTaskHubResource | undefined>[]> {
        const taskHubs: DurableTaskHubResource[] = context.dts ?
            await this.schedulerClient.getSchedulerTaskHubs(nonNullProp(context, 'subscription'), parseAzureResourceId(context.dts.id).resourceGroup, context.dts.name) : [];

        const createPick = {
            label: localize('createTaskHub', '$(plus) Create new durable task hub'),
            data: undefined,
        };

        return [
            createPick,
            ...taskHubs.map(h => {
                return {
                    label: h.name,
                    description: h.name === context.suggestedDTSHubNameLocalSettings ? localSettingsDescription : undefined,
                    data: h,
                };
            }),
        ];
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        const promptSteps: AzureWizardPromptStep<T>[] = [];
        const executeSteps: AzureWizardExecuteStep<T>[] = [];

        if (!context.dtsHub) {
            promptSteps.push(new DurableTaskHubNameStep(this.schedulerClient));
            executeSteps.push(new DurableTaskHubCreateStep(this.schedulerClient));
        }

        const dtsContributorRole: Role = {
            scopeId: context.dtsHub?.id,
            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.durableTaskDataContributor),
            roleDefinitionName: CommonRoleDefinitions.durableTaskDataContributor.roleName,
        };

        promptSteps.push(new FunctionAppUserAssignedIdentitiesListStep(dtsContributorRole /** targetRole */, { identityAssignStepPriority: 180 }));
        executeSteps.push(new RoleAssignmentExecuteStep(this.getDTSRoleAssignmentCallback(context, dtsContributorRole), { priority: 190 }));

        return { promptSteps, executeSteps };
    }

    private getDTSRoleAssignmentCallback(context: T, role: Role): () => Promise<Role[]> {
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

            let hasRoleAssignment: boolean = false;
            if (context.dts) {
                const taskSchedulerRoleAssignments = await uiUtils.listAllIterator(amClient.roleAssignments.listForScope(
                    context.dts.id,
                    {
                        // $filter=principalId eq {id}
                        filter: `principalId eq '{${context.managedIdentity?.principalId}}'`,
                    }
                ));
                hasRoleAssignment ||= taskSchedulerRoleAssignments.some(r => !!r.roleDefinitionId?.endsWith(role.roleDefinitionId));
            }

            if (!hasRoleAssignment && context.dtsHub) {
                const taskHubRoleAssignments = await uiUtils.listAllIterator(amClient.roleAssignments.listForScope(
                    roleAssignment.scopeId,
                    {
                        // $filter=principalId eq {id}
                        filter: `principalId eq '{${context.managedIdentity?.principalId}}'`,
                    }
                ));
                hasRoleAssignment ||= taskHubRoleAssignments.some(r => !!r.roleDefinitionId?.endsWith(role.roleDefinitionId));
            }

            if (hasRoleAssignment) {
                context.activityChildren?.push(
                    new ActivityChildItem({
                        label: localize('verifyIdentityWithRoleLabel', 'Verify identity "{0}" has role "{1}"', context.managedIdentity?.name, role.roleDefinitionName),
                        description: '0s',
                        contextValue: createContextValue(['roleAssignmentExecuteStepItem', activitySuccessContext]),
                        activityType: ActivityChildType.Success,
                        iconPath: activitySuccessIcon,
                    }),
                );
                ext.outputChannel.appendLog(localize('verifyIdentity', 'Successfully verified identity "{0}" has role "{1}".', context.managedIdentity?.name, role.roleDefinitionName));
            }

            return hasRoleAssignment ? [] : [roleAssignment];
        };
    }
}
