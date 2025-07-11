/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ManagedServiceIdentityClient } from '@azure/arm-msi';
import { type ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { createAuthorizationManagementClient, createManagedServiceIdentityClient, parseAzureResourceId, uiUtils, UserAssignedIdentityListStep, type ParsedAzureResourceId, type Role } from '@microsoft/vscode-azext-azureutils';
import { ActivityChildItem, ActivityChildType, activityInfoContext, activityInfoIcon, AzureWizardPromptStep, createContextValue, nonNullProp, prependOrInsertAfterLastInfoChild, type ActivityInfoChild, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { type ManagedIdentityAssignContext } from './ManagedIdentityAssignContext';
import { ManagedIdentityAssignStep } from './ManagedIdentityAssignStep';

/**
 * Wizard step to select a user-assigned managed identity from the parsed site of a function app.
 * Upon selection, retrieves and stores the identity on the wizard context.
 *
 * @param role Optional. If provided, the function app will be pre-checked for an existing user assigned identity with this target role.
 * If such an identity exists, it will be automatically assigned as a managed identity without prompting the user.
 *
 * @populates `context.managedIdentity`
 */
export class FunctionAppUserAssignedIdentitiesListStep<T extends ManagedIdentityAssignContext> extends AzureWizardPromptStep<T> {
    private _msiClient: ManagedServiceIdentityClient;

    constructor(
        readonly targetRole?: Role,
        readonly options?: { identityAssignStepPriority?: number },
    ) {
        super();
    }

    // Verify if any of the existing user assigned identities for the function app have the required role already
    public async configureBeforePrompt(context: T): Promise<void> {
        if (!this.targetRole?.scopeId) {
            return;
        }

        this._msiClient ??= await createManagedServiceIdentityClient(context);
        const amClient = await createAuthorizationManagementClient(context);

        const role: Role = this.targetRole;
        const site: ParsedSite = nonNullProp(context, 'site');
        const identityIds: string[] = Object.keys(site.identity?.userAssignedIdentities ?? {}) ?? [];
        context.telemetry.properties.functionAppUserAssignedIdentityCount = String(identityIds.length);

        let hasTargetRole: boolean = false;
        for (const identityId of identityIds) {
            const uaid = site.identity?.userAssignedIdentities?.[identityId];
            const roleAssignments = await uiUtils.listAllIterator(amClient.roleAssignments.listForScope(
                this.targetRole.scopeId,
                {
                    // $filter=principalId eq {id}
                    filter: `principalId eq '{${uaid?.principalId}}'`,
                }
            ));

            if (roleAssignments.some(r => !!r.roleDefinitionId?.endsWith(role.roleDefinitionId))) {
                const parsedIdentity = parseAzureResourceId(identityId);
                context.managedIdentity = await this._msiClient.userAssignedIdentities.get(parsedIdentity.resourceGroup, parsedIdentity.resourceName);
                hasTargetRole = true;
                break;
            }
        }

        context.telemetry.properties.functionAppHasIdentityWithTargetRole = String(hasTargetRole);

        if (hasTargetRole) {
            prependOrInsertAfterLastInfoChild(context,
                new ActivityChildItem({
                    label: localize('useIdentityWithRole', 'Use identity "{0}" with role "{1}"', context.managedIdentity?.name, this.targetRole.roleDefinitionName),
                    contextValue: createContextValue(['functionAppUserAssignedIdentitiesListStepItem', activityInfoContext]),
                    activityType: ActivityChildType.Info,
                    iconPath: activityInfoIcon
                }) as ActivityInfoChild,
            );
            ext.outputChannel.appendLog(localize('foundIdentity', 'Located existing user assigned identity "{0}" with role "{1}".', context.managedIdentity?.name, this.targetRole.roleDefinitionName));
        } else {
            ext.outputChannel.appendLog(localize('foundNoIdentity', 'Found no existing user assigned identity with role "{0}".', this.targetRole.roleDefinitionName));
        }
    }

    public async prompt(context: T): Promise<void> {
        const site: ParsedSite = nonNullProp(context, 'site');
        const identityId: string | undefined = (await context.ui.showQuickPick(await this.getPicks(site), {
            placeHolder: localize('selectFunctionAppIdentity', 'Select a function app identity for new role assignments'),
        })).data;

        if (!identityId) {
            return;
        }

        const parsedIdentity: ParsedAzureResourceId = parseAzureResourceId(identityId);
        this._msiClient ??= await createManagedServiceIdentityClient(context);

        context.managedIdentity = await this._msiClient.userAssignedIdentities.get(parsedIdentity.resourceGroup, parsedIdentity.resourceName);
        context.telemetry.properties.functionAppUserAssignedIdentityCount = String(Object.keys(site.identity?.userAssignedIdentities ?? {}).length);
    }

    public shouldPrompt(context: T): boolean {
        return !context.managedIdentity;
    }

    public async getSubWizard(context: T): Promise<IWizardOptions<T> | undefined> {
        if (context.managedIdentity) {
            return undefined;
        }

        return {
            promptSteps: [new UserAssignedIdentityListStep()],
            executeSteps: [new ManagedIdentityAssignStep({ priority: this.options?.identityAssignStepPriority })],
        };
    }

    private async getPicks(site: ParsedSite): Promise<IAzureQuickPickItem<string | undefined>[]> {
        const picks: IAzureQuickPickItem<string | undefined>[] = [{
            label: localize('assignIdentity', '$(plus) Assign new user-assigned identity'),
            data: undefined,
        }];

        return picks.concat(
            Object
                .keys(site.identity?.userAssignedIdentities ?? {})
                .map((id) => {
                    const parsedResource: ParsedAzureResourceId = parseAzureResourceId(id);
                    return {
                        label: parsedResource.resourceName,
                        description: parsedResource.resourceGroup,
                        data: id,
                    };
                }),
        );
    }
}
