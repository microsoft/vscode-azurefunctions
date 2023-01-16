/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard } from "@microsoft/vscode-azext-utils";
import { CodeAction, ConnectionKey, localStorageEmulatorConnectionString } from "../../../../constants";
import { getLocalSettingsConnectionString } from "../../../../funcConfig/local.settings";
import { IConnectionPromptOptions } from "../IConnectionPromptOptions";
import { ISetConnectionSettingContext } from "../ISetConnectionSettingContext";
import { AzureWebJobsStorageExecuteStep } from "./AzureWebJobsStorageExecuteStep";
import { AzureWebJobsStoragePromptStep } from "./AzureWebJobsStoragePromptStep";
import { IAzureWebJobsStorageWizardContext } from "./IAzureWebJobsStorageWizardContext";

// Supports validation on both 'debug' and 'deploy'
export async function validateStorageConnection(context: Omit<ISetConnectionSettingContext, 'projectPath'>, projectPath: string, options?: IConnectionPromptOptions): Promise<void> {
    const currentStorageConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.Storage, projectPath);
    if (currentStorageConnection) {
        if (context.action === CodeAction.Deploy) {
            if (currentStorageConnection !== localStorageEmulatorConnectionString) {
                // Found a valid connection in deploy mode. Set it and skip the wizard.
                context[ConnectionKey.Storage] = currentStorageConnection;
                return;
            }
            // Found an invalid connection for deploy mode, we need to proceed with acquiring a connection through the wizard...
        } else {
            // Found a valid connection in debug mode.  Skip the wizard.
            return;
        }
    }

    const wizardContext: IAzureWebJobsStorageWizardContext = Object.assign(context, { projectPath });
    const wizard: AzureWizard<IAzureWebJobsStorageWizardContext> = new AzureWizard(wizardContext, {
        promptSteps: [new AzureWebJobsStoragePromptStep(options)],
        executeSteps: [new AzureWebJobsStorageExecuteStep()]
    });
    await wizard.prompt();
    await wizard.execute();
}
