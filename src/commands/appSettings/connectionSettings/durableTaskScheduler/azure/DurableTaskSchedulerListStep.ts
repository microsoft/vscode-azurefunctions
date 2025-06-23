/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommonRoleDefinitions, createRoleId, LocationListStep, parseAzureResourceId, RoleAssignmentExecuteStep, type ILocationWizardContext, type Role } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, nonNullProp, type AzureWizardExecuteStep, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { DurableTaskProvider, DurableTaskSchedulersResourceType } from '../../../../../constants';
import { localSettingsDescription } from '../../../../../constants-nls';
import { localize } from '../../../../../localize';
import { HttpDurableTaskSchedulerClient, type DurableTaskSchedulerClient, type DurableTaskSchedulerResource } from '../../../../../tree/durableTaskScheduler/DurableTaskSchedulerClient';
import { getSchedulerConnectionString, SchedulerAuthenticationType } from '../../../../durableTaskScheduler/copySchedulerConnectionString';
import { FunctionAppUserAssignedIdentitiesListStep } from '../../../../identity/listUserAssignedIdentities/FunctionAppUserAssignedIdentitiesListStep';
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
            context.newDTSConnectionSetting = getSchedulerConnectionString(context.dts?.properties.endpoint ?? '', SchedulerAuthenticationType.UserAssignedIdentity);
            context.valuesToMask.push(context.dts.name);
            context.valuesToMask.push(context.newDTSConnectionSetting);
        }

        context.telemetry.properties.usedLocalDTSConnectionSettings = context.suggestedDTSEndpointLocalSettings ? String(context.newDTSConnectionSetting === context.suggestedDTSEndpointLocalSettings) : undefined;
    }

    public shouldPrompt(context: T): boolean {
        return !context.dts;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        const promptSteps: AzureWizardPromptStep<T>[] = [];
        const executeSteps: AzureWizardExecuteStep<T>[] = [];

        if (!context.dts) {
            // Note: The location offering for this provider isn't 1:1 with what's available for the function app
            // Todo: We should probably update the behavior of LocationListStep so that we re-verify the provider locations even if the location is already set
            LocationListStep.addProviderForFiltering(context as unknown as ILocationWizardContext, DurableTaskProvider, DurableTaskSchedulersResourceType);
            LocationListStep.addStep(context, promptSteps as AzureWizardPromptStep<ILocationWizardContext>[]);

            promptSteps.push(new DurableTaskSchedulerNameStep(this._schedulerClient));
            executeSteps.push(new DurableTaskSchedulerCreateStep(this._schedulerClient));
        }

        if (!context.dtsHub) {
            promptSteps.push(new DurableTaskHubListStep(this._schedulerClient));
        }

        const dtsContributorRole: Role = {
            scopeId: context.dts?.id,
            roleDefinitionId: createRoleId(context.subscriptionId, CommonRoleDefinitions.durableTaskDataContributor),
            roleDefinitionName: CommonRoleDefinitions.durableTaskDataContributor.roleName,
        };

        const identitiesListStep = new FunctionAppUserAssignedIdentitiesListStep(dtsContributorRole /** targetRole */);
        promptSteps.push(identitiesListStep);
        executeSteps.push(new RoleAssignmentExecuteStep(getDTSRoleAssignmentCallback(context, identitiesListStep, dtsContributorRole)));

        return { promptSteps, executeSteps };

        function getDTSRoleAssignmentCallback(context: T, functionAppIdentitiesListStep: FunctionAppUserAssignedIdentitiesListStep<T>, role: Role): () => Role[] {
            return () => {
                const roleAssignment: Role = {
                    ...role,
                    // This id may be missing when the role is initially passed in,
                    // but by the time we run the step, we should have the populated id ready.
                    scopeId: context.dts?.id,
                };

                return functionAppIdentitiesListStep.hasIdentityWithTargetRole ? [] : [roleAssignment];
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
