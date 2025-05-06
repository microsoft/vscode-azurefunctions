/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activitySuccessIcon, AzExtFsExtra, AzureWizardExecuteStep, createContextValue, nonNullProp } from "@microsoft/vscode-azext-utils";
import { ext } from "../../extensionVariables";
import { getLocalSettingsJsonwithEncryption } from "../../funcConfig/local.settings";
import { localize } from "../../localize";
import { getLocalSettingsFile } from "../appSettings/localSettings/getLocalSettingsFile";
import { type AddMIConnectionsContext } from "./AddMIConnectionsContext";

export class LocalSettingsAddStep extends AzureWizardExecuteStep<AddMIConnectionsContext> {
    public priority: number = 160;
    public stepName: string = 'localSettingsAddStep';

    public async execute(context: AddMIConnectionsContext): Promise<void> {
        // If right clicking on a connection we will have the connections to convert but not the local settings path
        if (!context.localSettingsPath) {
            const message: string = localize('selectLocalSettings', 'Select the local settings file to add connections to.');
            context.localSettingsPath = await getLocalSettingsFile(context, message);
        }

        const localSettings = await getLocalSettingsJsonwithEncryption(context, context.localSettingsPath);
        if (localSettings.Values) {
            // Potentially split this up into multiple execute steps to allow for better progress reporting
            for (const connection of nonNullProp(context, 'connectionsToAdd')) {
                localSettings.Values[connection.name] = connection.value;
                // TODO: Convert to use createSuccessOutput
                context.activityChildren?.push(
                    new ActivityChildItem({
                        contextValue: createContextValue([this.stepName]),
                        label: localize('addedLocalSetting', 'Add local setting "{0}"', connection.name),
                        iconPath: activitySuccessIcon,
                        activityType: ActivityChildType.Success
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
