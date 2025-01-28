/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ManagedServiceIdentity, type ManagedServiceIdentityType } from "@azure/arm-appservice";
import { createWebSiteClient, type ParsedSite } from "@microsoft/vscode-azext-azureappservice";
import { AzureWizardExecuteStep, nonNullProp } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { type ManagedIdentityAssignContext } from "./ManagedIdentityAssignContext";

export class ManagedIdentityAssignStep extends AzureWizardExecuteStep<ManagedIdentityAssignContext> {
    public priority: number;

    public async execute(context: ManagedIdentityAssignContext, _progress: Progress<{ message?: string | undefined; increment?: number | undefined; }>): Promise<void> {
        const site: ParsedSite = nonNullProp(context, 'site');
        const managedIdentity = nonNullProp(context, 'managedIdentity');
        const id: string = nonNullProp(managedIdentity, 'id');
        const client = await createWebSiteClient([context, site.subscription]);

        const existingIdentity = site.rawSite.identity || {};
        const updatedIdentity: ManagedServiceIdentity = {
            ...existingIdentity,
            // TODO: test if this is needed or if it's handles automatically
            type: addUserAssignedType(existingIdentity.type),
            userAssignedIdentities: {
                ...existingIdentity.userAssignedIdentities,
                [id]: {
                    principalId: managedIdentity.principalId,
                    clientId: managedIdentity.clientId,
                }
            }
        };

        const newSite = site.rawSite;
        newSite.identity = updatedIdentity;

        await client.webApps.beginCreateOrUpdateAndWait(site.resourceGroup, site.siteName, newSite);
        console.log(`Assigned managed identity ${id} to function app ${site.fullName}`);
    }

    public shouldExecute(_context: ManagedIdentityAssignContext): boolean {
        return true;
    }

}

const addUserAssignedType = (type: ManagedServiceIdentityType | undefined): ManagedServiceIdentityType => {
    if (type?.includes('UserAssigned')) {
        return type
    }
    if (type === 'SystemAssigned') {
        return 'SystemAssigned, UserAssigned';
    }
    return 'UserAssigned';
};
