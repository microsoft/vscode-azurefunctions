/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { activitySuccessContext, activitySuccessIcon, AzExtFsExtra, AzureWizardExecuteStep, createUniversallyUniqueContextValue, GenericTreeItem, nonNullProp } from "@microsoft/vscode-azext-utils";
import { ext } from "../../extensionVariables";
import { getLocalSettingsJsonwithEncryption } from "../../funcConfig/local.settings";
import { localize } from "../../localize";
import { getLocalSettingsFile } from "../appSettings/localSettings/getLocalSettingsFile";
import { type AddMIConnectionsContext } from "./AddMIConnectionsContext";

export class LocalSettingsAddStep extends AzureWizardExecuteStep<AddMIConnectionsContext> {
    public priority: number = 125;

    public async execute(context: AddMIConnectionsContext): Promise<void> {
        // If right clicking on a connection we will have the connections to convert but not the local settings path
        if (!context.localSettingsPath) {
            const message: string = localize('selectLocalSettings', 'Select the local settings file to add connections to.');
            context.localSettingsPath = await getLocalSettingsFile(context, message);
        }

        const localSettings = await getLocalSettingsJsonwithEncryption(context, context.localSettingsPath);
        if (localSettings.Values) {
            for (const connection of nonNullProp(context, 'connectionsToAdd')) {
                localSettings.Values[connection.name] = connection.value;
                context.activityChildren?.push(
                    new GenericTreeItem(undefined, {
                        contextValue: createUniversallyUniqueContextValue(['useExistingResourceGroupInfoItem', activitySuccessContext]),
                        label: localize('addedLocalSetting', 'Add local setting "{0}"', connection.name),
                        iconPath: activitySuccessIcon
                    })
                );
            }
            await AzExtFsExtra.writeJSON(nonNullProp(context, 'localSettingsPath'), localSettings);
            await ext.rgApi.workspaceResourceTree.refresh(context);
        }
    }
    public shouldExecute(context: AddMIConnectionsContext): boolean {
        return !context.functionapp && !!context.connections
    }
}
