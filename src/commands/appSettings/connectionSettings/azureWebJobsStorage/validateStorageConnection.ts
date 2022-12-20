/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, IActionContext } from "@microsoft/vscode-azext-utils";
import { ConnectionKey } from "../../../../constants";
import { getLocalConnectionString } from "../../../../funcConfig/local.settings";
import { IValidateConnectionOptions } from "../IConnectionPromptOptions";
import { AzureWebJobsStorageExecuteStep } from "./AzureWebJobsStorageExecuteStep";
import { AzureWebJobsStoragePromptStep } from "./AzureWebJobsStoragePromptStep";
import { IAzureWebJobsStorageWizardContext } from "./IAzureWebJobsStorageWizardContext";

// Supports validation on both 'debug' and 'deploy'
export async function validateStorageConnection(context: IActionContext, projectPath: string, options?: IValidateConnectionOptions): Promise<void> {
    const currentStorageConnection: string | undefined = await getLocalConnectionString(context, ConnectionKey.Storage, projectPath);
    if (!!currentStorageConnection) {
        if (options?.setConnectionForDeploy) {
            Object.assign(context, { azureWebJobsRemoteConnection: currentStorageConnection });
        }
        return;
    }

    const wizardContext: IAzureWebJobsStorageWizardContext = Object.assign(context, { projectPath });
    const wizard: AzureWizard<IAzureWebJobsStorageWizardContext> = new AzureWizard(wizardContext, {
        promptSteps: [new AzureWebJobsStoragePromptStep({ preselectedConnectionType: options?.preselectedConnectionType })],
        executeSteps: [new AzureWebJobsStorageExecuteStep(options?.setConnectionForDeploy)]
    });
    await wizard.prompt();
    await wizard.execute();
}
