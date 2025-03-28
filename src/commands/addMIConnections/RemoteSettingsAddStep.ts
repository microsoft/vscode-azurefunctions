/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { activitySuccessContext, activitySuccessIcon, AzureWizardExecuteStep, createUniversallyUniqueContextValue, GenericTreeItem, nonNullProp } from "@microsoft/vscode-azext-utils";
import { ext } from "../../extensionVariables";
import { localize } from "../../localize";
import { type AddMIConnectionsContext } from "./AddMIConnectionsContext";

export class RemoteSettingsAddStep extends AzureWizardExecuteStep<AddMIConnectionsContext> {
    public priority: number = 110;

    public async execute(context: AddMIConnectionsContext): Promise<void> {
        const client = await nonNullProp(context, 'functionapp').site.createClient(context);
        const remoteSettings = await client.listApplicationSettings();
        const properties = remoteSettings.properties || {};
        for (const connection of nonNullProp(context, 'connectionsToAdd')) {
            properties[connection.name] = connection.value;
        }

        await client.updateApplicationSettings({ properties });
        for (const connection of nonNullProp(context, 'connectionsToAdd')) {
            context.activityChildren?.push(
                new GenericTreeItem(undefined, {
                    contextValue: createUniversallyUniqueContextValue(['useExistingResourceGroupInfoItem', activitySuccessContext]),
                    label: localize('addedAppSetting', 'Add app setting "{0}"', connection.name),
                    iconPath: activitySuccessIcon
                })
            );
        }
        await ext.rgApi.tree.refresh(context);
    }

    public shouldExecute(context: AddMIConnectionsContext): boolean {
        return !!context.functionapp && !!context.connections;
    }
}
