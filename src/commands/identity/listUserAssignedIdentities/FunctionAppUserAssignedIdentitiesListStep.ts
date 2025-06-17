/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ManagedServiceIdentityClient } from '@azure/arm-msi';
import { type ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import { createAuthorizationManagementClient, createManagedServiceIdentityClient, parseAzureResourceId, type ParsedAzureResourceId, type Role } from '@microsoft/vscode-azext-azureutils';
import { AzureWizardPromptStep, nonNullProp, type IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../localize';
import { type FunctionAppUserAssignedIdentitiesContext } from './FunctionAppUserAssignedIdentitiesContext';

/**
 * Wizard step to select a user-assigned managed identity from the parsed site of a function app.
 * Upon selection, retrieves and stores the identity on the wizard context.
 *
 * @populates `context.managedIdentity`
 */
export class FunctionAppUserAssignedIdentitiesListStep<T extends FunctionAppUserAssignedIdentitiesContext> extends AzureWizardPromptStep<T> {
    private _msiClient: ManagedServiceIdentityClient;

    constructor(readonly role: Role) {
        super();
    }

    public async configureBeforePrompt(context: T): Promise<void> {
        this._msiClient ??= await createManagedServiceIdentityClient(context);
        const amClient = await createAuthorizationManagementClient(context)

        const site: ParsedSite = nonNullProp(context, 'site');
        const identityIds: string[] = Object.keys(site.identity?.userAssignedIdentities ?? {}) ?? [];
        amClient.roleAssignments.
    }

    public async prompt(context: T): Promise<void> {
        const site: ParsedSite = nonNullProp(context, 'site');
        const identityId: string = (await context.ui.showQuickPick(await this.getPicks(site), {
            placeHolder: localize('selectFunctionAppIdentity', 'Select a function app identity for new role assignments'),
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
            return {
                label: parseAzureResourceId(id).resourceName,
                description: id,
                data: id,
            };
        });
    }
}
