/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { ConnectionType, DurableBackend } from "../../../constants";
import { localize } from "../../../localize";
import { IFunctionTemplate } from "../../../templates/IFunctionTemplate";
import { EventHubsConnectionExecuteStep } from "../../appSettings/EventHubsConnectionExecuteStep";
import { EventHubsConnectionPromptStep } from "../../appSettings/EventHubsConnectionPromptStep";
import { IFunctionWizardContext } from "../IFunctionWizardContext";
import { NetheriteConfigureHostStep } from "./netherite/NetheriteConfigureHostStep";
import { NetheriteEventHubNameStep } from "./netherite/NetheriteEventHubNameStep";

export class DurableSubWizard {
    public static async createSubWizard(context: IFunctionWizardContext) {
        const template: IFunctionTemplate | undefined = context.functionTemplate;
        if (template) {
            const promptSteps: AzureWizardPromptStep<IFunctionWizardContext>[] = [];
            const executeSteps: AzureWizardExecuteStep<IFunctionWizardContext>[] = [];

            // preSelectedConnectionType will default to None ('skipForNow') for durable storage to minimize the number of creation prompts
            switch (context.newDurableStorageType) {
                case DurableBackend.Netherite:
                    promptSteps.push(new EventHubsConnectionPromptStep({ preSelectedConnectionType: ConnectionType.None }), new NetheriteEventHubNameStep());
                    executeSteps.push(new EventHubsConnectionExecuteStep(), new NetheriteConfigureHostStep());
                    break;
                case DurableBackend.SQL:
                    // Todo: Uncomment out in future PR
                    // promptSteps.push(new SqlDatabaseConnectionPromptStep(), new SqlDatabaseListStep());
                    // executeSteps.push(new SqlDatabaseConnectionExecuteStep());
                    break;
                case DurableBackend.Storage:
                    // FunctionSubWizard already takes care of AzureWebJobs logic...
                    break;
                default:
            }

            const title: string = localize('createFunction', 'Create new {0}', template.name);
            return { promptSteps, executeSteps, title };
        } else {
            return undefined;
        }
    }
}
