/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { localize } from "../../localize";
import { type IConvertConnectionsContext } from "./IConvertConnectionsContext";
import { type Connection } from "./SelectConnectionsStep";

export class ConfirmRoleAssignmnetStep extends AzureWizardPromptStep<IConvertConnectionsContext> {
    public async prompt(context: IConvertConnectionsContext): Promise<void> {
        context.modifyRoles = (await context.ui.showQuickPick(this.getQuickPics(context), {
            placeHolder: localize('selectRoles', 'Select roles you would like to modify. Otherwise, press enter to continue.'),
            suppressPersistence: true,
            canPickMany: true,
        })).map(item => item.data);
    }

    public shouldPrompt(context: IConvertConnectionsContext): boolean {
        return !context.modifyRoles || context.modifyRoles.length > 0;
    }

    private async getQuickPics(context: IConvertConnectionsContext): Promise<IAzureQuickPickItem<Connection>[]> {
        const picks: IAzureQuickPickItem<Connection>[] = [];

        // TODO: don't let users uncheck roles

        if (context.connections) {
            for (const connection of context.connections) {
                // ToDo: add logic for which roles will auto be assigned to specific connections
                if (connection.value.includes('STORAGE')) {
                    connection.role = 'storage role' // this is a placeholder may need to set both queue and blob roles
                } else if (connection.value.includes('DOCUMENTDB')) {
                    connection.role = 'documentdb role' // this is a placeholder
                } else if (connection.value.includes('EVENTHUB')) {
                    connection.role = 'eventhub role' // this is a placeholder
                } else if (connection.value.includes('SERVICEBUS')) {
                    connection.role = 'servicebus role' // this is a placeholder
                }
                else {
                    continue;
                }
                // create the connections on the portal to see what the connection strings look like
                // also check to see what value needs to be passed in to add the role for the connection
                picks.push({ label: connection.name, data: connection });
            }
        }

        return picks;
    }
}
