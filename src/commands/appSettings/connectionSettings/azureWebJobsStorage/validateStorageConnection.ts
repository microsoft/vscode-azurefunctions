/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard } from "@microsoft/vscode-azext-utils";
import { CodeAction, ConnectionKey } from "../../../../constants";
import { getLocalSettingsConnectionString } from "../../../../funcConfig/local.settings";
import { type IConnectionPromptOptions } from "../IConnectionPromptOptions";
import { type ISetConnectionSettingContext } from "../ISetConnectionSettingContext";
import { AzureWebJobsStoragePromptStep } from "./AzureWebJobsStoragePromptStep";
import { AzureWebJobsStorageSetSettingStep } from "./AzureWebJobsStorageSetSettingStep";
import { type IAzureWebJobsStorageWizardContext } from "./IAzureWebJobsStorageWizardContext";

export async function validateStorageConnection(context: Omit<ISetConnectionSettingContext, 'projectPath'>, projectPath: string, options?: IConnectionPromptOptions): Promise<void> {
    if (context.action === CodeAction.Deploy) {
        // Skip validation on deploy - we already connect the storage account for the user when the Function App is initially created
        return;
    }

    const currentStorageConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.Storage, projectPath);
    const currentStorageIdentityConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.StorageIdentity, projectPath);
    if (currentStorageConnection || currentStorageIdentityConnection) {
        // Found a valid connection in debug mode.  Skip the wizard.
        return;
    }

    const wizardContext: IAzureWebJobsStorageWizardContext = Object.assign(context, { projectPath });
    const wizard: AzureWizard<IAzureWebJobsStorageWizardContext> = new AzureWizard(wizardContext, {
        promptSteps: [new AzureWebJobsStoragePromptStep(options)],
        executeSteps: [new AzureWebJobsStorageSetSettingStep()]
    });
    await wizard.prompt();
    await wizard.execute();
}
