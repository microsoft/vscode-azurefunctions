/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, type IActionContext } from "@microsoft/vscode-azext-utils";
import { getStorageLocalSettingsValue } from "../../../commands/appSettings/connectionSettings/azureWebJobsStorage/getStorageLocalProjectConnections";
import { type IStorageConnectionWizardContext } from "../../../commands/appSettings/connectionSettings/azureWebJobsStorage/IStorageConnectionWizardContext";
import { StorageConnectionListStep } from "../../../commands/appSettings/connectionSettings/azureWebJobsStorage/StorageConnectionListStep";
import { CodeAction, ConnectionKey, ConnectionType } from "../../../constants";
import { getLocalSettingsConnectionString } from "../../../funcConfig/local.settings";

export async function setStorageConnectionPreDebugIfNeeded(context: IActionContext, projectPath: string): Promise<void> {
    const projectPathContext = Object.assign(context, { projectPath });
    const storageConnectionKey: string = ConnectionKey.Storage;
    const storageConnection: string | undefined = await getStorageLocalSettingsValue(projectPathContext, storageConnectionKey);
    const storageIdentityConnection: string | undefined = (await getLocalSettingsConnectionString(context, ConnectionKey.StorageIdentity, projectPath))[0];

    if (storageConnection || storageIdentityConnection) {
        return;
    }

    const availableDebugConnectionTypes = new Set([ConnectionType.Azure, ConnectionType.Emulator]) satisfies Set<Exclude<ConnectionType, 'Custom'>>;

    const wizardContext: IStorageConnectionWizardContext = Object.assign(context, {
        projectPath,
        action: CodeAction.Debug,
        // If the user hasn't already set up a managed identity, we can default to connection string for ease of use
        // in the future we can explore if we want to include managed identity here as well
        newStorageConnectionSettingKey: storageConnectionKey,
    });

    const wizard: AzureWizard<IStorageConnectionWizardContext> = new AzureWizard(wizardContext, {
        promptSteps: [new StorageConnectionListStep(availableDebugConnectionTypes)],
    });

    await wizard.prompt();
    await wizard.execute();
}
