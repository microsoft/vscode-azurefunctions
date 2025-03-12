/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { activitySuccessContext, activitySuccessIcon, AzureWizardExecuteStep, createUniversallyUniqueContextValue, GenericTreeItem, nonNullProp } from "@microsoft/vscode-azext-utils";
import { ext } from "../../extensionVariables";
import { localize } from "../../localize";
import { type IAddMIConnectionsContext } from "./IAddMIConnectionsContext";

export class RemoteSettingsAddStep extends AzureWizardExecuteStep<IAddMIConnectionsContext> {
    public priority: number = 110;

    public async execute(context: IAddMIConnectionsContext): Promise<void> {
        if (!context.functionapp) {
            throw new Error(localize('functionAppNotFound', 'Function app not found.'));
        }

        const client = await context.functionapp?.site.createClient(context);
        const remoteSettings = await client.listApplicationSettings();
        for (const connection of nonNullProp(context, 'connectionsToAdd')) {
            if (remoteSettings.properties) {
                remoteSettings.properties[connection.name] = connection.value;
            } else {
                await client.updateApplicationSettings({ properties: { [connection.name]: connection.value } });
            }
            context.activityChildren?.push(
                new GenericTreeItem(undefined, {
                    contextValue: createUniversallyUniqueContextValue(['useExistingResourceGroupInfoItem', activitySuccessContext]),
                    label: localize('addedAppSetting', 'Add app setting "{0}"', connection.name),
                    iconPath: activitySuccessIcon
                })
            );
        }

        await client.updateApplicationSettings({ properties: remoteSettings.properties });
        await ext.rgApi.tree.refresh(context);
    }

    public shouldExecute(context: IAddMIConnectionsContext): boolean {
        return !!context.functionapp && !!context.connections;
    }
}
