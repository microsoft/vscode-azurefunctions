/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ManagedServiceIdentityClient } from '@azure/arm-msi';
import { type ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { createAuthorizationManagementClient, createManagedServiceIdentityClient, parseAzureResourceId, uiUtils, type ParsedAzureResourceId, type Role } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, nonNullProp, type IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import { ext } from '../../../extensionVariables';
import { localize } from '../../../localize';
import { type IFunctionAppUserAssignedIdentitiesContext } from './IFunctionAppUserAssignedIdentitiesContext';

/**
 * Wizard step to select a user-assigned managed identity from the parsed site of a function app.
 * Upon selection, retrieves and stores the identity on the wizard context.
 *
 * @param role Optional. If provided, the function app will be pre-checked for an existing user assigned identity with this target role.
 * If such an identity exists, it will be automatically assigned as a managed identity without prompting the user.
 *
 * @populates `context.managedIdentity`
 */
export class FunctionAppUserAssignedIdentitiesListStep<T extends IFunctionAppUserAssignedIdentitiesContext> extends AzureWizardPromptStep<T> {
    private _msiClient: ManagedServiceIdentityClient;
    private _hasTargetRole?: boolean;

    constructor(readonly targetRole?: Role) {
        super();
    }

    /**
     * Indicates whether there is at least one user-assigned identity on the function app with the provided role.
     * If no role is provided, or if the step has not yet been run, this will return `undefined`.
     */
    get hasIdentityWithTargetRole(): boolean | undefined {
        return this._hasTargetRole;
    }

    // Verify if any of the existing user assigned identities for the function app have the required role already
    public async configureBeforePrompt(context: T): Promise<void> {
        if (!this.targetRole || !this.targetRole?.scopeId) {
            this._hasTargetRole = undefined;
            return;
        }

        this._hasTargetRole = false;
        this._msiClient ??= await createManagedServiceIdentityClient(context);
        const amClient = await createAuthorizationManagementClient(context);

        const role: Role = this.targetRole;
        const site: ParsedSite = nonNullProp(context, 'site');
        const identityIds: string[] = Object.keys(site.identity?.userAssignedIdentities ?? {}) ?? [];
        context.telemetry.properties.functionAppUserAssignedIdentityCount = String(identityIds.length);

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
                this._hasTargetRole = true;
                break;
            }
        }

        context.telemetry.properties.functionAppHasIdentityWithTargetRole = String(this.hasIdentityWithTargetRole);

        this.hasIdentityWithTargetRole ?
            ext.outputChannel.appendLog(localize('foundIdentity', 'Located existing user assigned identity "{0}" with role "{1}".', context.managedIdentity?.name, this.targetRole.roleDefinitionName)) :
            ext.outputChannel.appendLog(localize('foundNoIdentity', 'Found no existing user assigned identity with role "{0}".', this.targetRole.roleDefinitionName));
    }

    public async prompt(context: T): Promise<void> {
        const site: ParsedSite = nonNullProp(context, 'site');
        const identityId: string = (await context.ui.showQuickPick(await this.getPicks(site), {
            placeHolder: localize('selectFunctionAppIdentity', 'Select a function app identity for new role assignments'),
            // Todo: Remove when create + assign is implemented
            noPicksMessage: localize('noUserAssignedIdentities', 'No identities found. Add a user assigned identity to the function app before proceeding.'),
        })).data;

        const parsedIdentity: ParsedAzureResourceId = parseAzureResourceId(identityId);
        this._msiClient ??= await createManagedServiceIdentityClient(context);

        context.managedIdentity = await this._msiClient.userAssignedIdentities.get(parsedIdentity.resourceGroup, parsedIdentity.resourceName);
        context.telemetry.properties.functionAppUserAssignedIdentityCount = String(Object.keys(site.identity?.userAssignedIdentities ?? {}).length);
    }

    public shouldPrompt(context: T): boolean {
        return !context.managedIdentity;
    }

    private async getPicks(site: ParsedSite): Promise<IAzureQuickPickItem<string>[]> {
        return Object.keys(site.identity?.userAssignedIdentities ?? {}).map((id) => {
            const parsedResource: ParsedAzureResourceId = parseAzureResourceId(id);
            return {
                label: parsedResource.resourceName,
                description: parsedResource.resourceGroup,
                data: id,
            };
        });
    }
}
