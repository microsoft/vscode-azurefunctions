/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import { type IConvertConnectionsContext } from "./IConvertConnectionsContext";

export class ConvertLocalSettingsStep extends AzureWizardExecuteStep<IConvertConnectionsContext> {
    public priority: number = 100; // ToDO: check this

    public async execute(context: IConvertConnectionsContext): Promise<void> {
        // check each type of trigger and change the name of the connection and the value
        if (context.connections) {
            for (const connection of context.connections) {
                if (connection.value.includes('STORAGE')) {
                    //write the connection to the local.settings.json file
                } else if (connection.value.includes('DOCUMENTDB')) {
                    //write the connection to the local.settings.json file
                } else if (connection.value.includes('EVENTHUB')) {
                    //write the connection to the local.settings.json file
                } else if (connection.value.includes('SERVICEBUS')) {
                    //write the connection to the local.settings.json file
                } else {
                    continue;
                }
            }
        }
    }

    public shouldExecute(): boolean {
        return true;
    }
}
