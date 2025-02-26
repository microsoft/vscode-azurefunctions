/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ManagedServiceIdentityType } from "@azure/arm-appservice";
import { type Identity } from "@azure/arm-resources";
import { createWebSiteClient, type ParsedSite } from "@microsoft/vscode-azext-azureappservice";
import { AzureWizardExecuteStep, nonNullProp } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { ext } from "../../extensionVariables";
import { localize } from "../../localize";
import { type ManagedIdentityAssignContext } from "./ManagedIdentityAssignContext";

export class EnableSystemIdentityAssignStep extends AzureWizardExecuteStep<ManagedIdentityAssignContext> {
    public priority: number;

    public async execute(context: ManagedIdentityAssignContext, _progress: Progress<{ message?: string | undefined; increment?: number | undefined; }>): Promise<void> {
        const site: ParsedSite = nonNullProp(context, 'site');
        const client = await createWebSiteClient([context, site.subscription]);

        const identity = site.rawSite.identity || {};
        identity.type = addSystemAssignedType(identity);
        site.rawSite.identity = identity;

        const enabling: string = localize('enabling', 'Enabling system assigned identity for "{0}"...', site.fullName);
        const enabled: string = localize('enabled', 'Enabled system assigned identity for "{0}"', site.fullName);
        ext.outputChannel.appendLog(enabling);

        await client.webApps.update(site.resourceGroup, site.siteName, site.rawSite);
        ext.outputChannel.appendLog(enabled);
    }

    public shouldExecute(_context: ManagedIdentityAssignContext): boolean {
        return true;
    }
}

const addSystemAssignedType = (identity: Identity): ManagedServiceIdentityType => {
    if (!identity.type || identity.type === 'None') {
        return 'SystemAssigned';
    } else if (identity.type === ('UserAssigned')) {
        return 'SystemAssigned, UserAssigned';
    } else {
        return nonNullProp(identity, 'type');
    }
};
