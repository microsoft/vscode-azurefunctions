/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activitySuccessContext, activitySuccessIcon, AzureWizardExecuteStep, createUniversallyUniqueContextValue, nonNullProp } from "@microsoft/vscode-azext-utils";
import { ext } from "../../extensionVariables";
import { localize } from "../../localize";
import { type AddMIConnectionsContext } from "./AddMIConnectionsContext";

export class RemoteSettingsAddStep extends AzureWizardExecuteStep<AddMIConnectionsContext> {
    public priority: number = 160;

    public async execute(context: AddMIConnectionsContext): Promise<void> {
        const client = await nonNullProp(context, 'functionapp').site.createClient(context);
        const remoteSettings = await client.listApplicationSettings();
        const properties = remoteSettings.properties || {};
        for (const connection of nonNullProp(context, 'connectionsToAdd')) {
            properties[connection.name] = connection.value;
        }

        await client.updateApplicationSettings({ properties });
        for (const connection of nonNullProp(context, 'connectionsToAdd')) {
            // TODO: Convert to use createSuccessOutput
            context.activityChildren?.push(
                new ActivityChildItem({
                    contextValue: createUniversallyUniqueContextValue(['useExistingResourceGroupInfoItem', activitySuccessContext]),
                    label: localize('addedAppSetting', 'Add app setting "{0}"', connection.name),
                    iconPath: activitySuccessIcon,
                    activityType: ActivityChildType.Success
                })
            );
        }
        await ext.rgApi.tree.refresh(context);
    }

    public shouldExecute(context: AddMIConnectionsContext): boolean {
        return !!context.functionapp && !!context.connections;
    }
}
