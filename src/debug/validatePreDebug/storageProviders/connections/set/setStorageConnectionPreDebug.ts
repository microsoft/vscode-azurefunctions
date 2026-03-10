/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type IStorageConnectionWizardContext } from "../../../../../commands/appSettings/connectionSettings/azureWebJobsStorage/IStorageConnectionWizardContext";
import { StorageConnectionListStep } from "../../../../../commands/appSettings/connectionSettings/azureWebJobsStorage/StorageConnectionListStep";
import { CodeAction, ConnectionKey, ConnectionType } from "../../../../../constants";
import { getLocalSettingsConnectionString } from "../../../../../funcConfig/local.settings";
import { localize } from "../../../../../localize";

export async function setStorageConnectionPreDebugIfNeeded(context: IActionContext, projectPath: string, useEmulator?: boolean): Promise<void> {
    const [storageConnection] = await getLocalSettingsConnectionString(context, ConnectionKey.Storage, projectPath);
    const storageIdentityConnection: string | undefined = (await getLocalSettingsConnectionString(context, ConnectionKey.StorageIdentity, projectPath))[0];

    if (storageIdentityConnection) {
        return;
    }

    // If a connection string already exists (emulator or otherwise), skip.
    // Starting the emulator is deferred to LocalEmulatorsListStep in the validation wizard.
    if (storageConnection) {
        return;
    }

    const availableDebugConnectionTypes = new Set([ConnectionType.Azure, ConnectionType.Emulator]) satisfies Set<Exclude<ConnectionType, 'Custom'>>;

    const wizardContext: IStorageConnectionWizardContext = Object.assign(context, {
        projectPath,
        activityChildren: [],
        action: CodeAction.Debug,
        azureWebJobsStorageType: useEmulator ? ConnectionType.Emulator as const : undefined,
        newStorageConnectionSettingKey: ConnectionKey.Storage,
    });

    const wizard: AzureWizard<IStorageConnectionWizardContext> = new AzureWizard(wizardContext, {
        title: localize('prepareStorageConnection', 'Prepare Azure Storage debug configuration'),
        promptSteps: [new StorageConnectionListStep(availableDebugConnectionTypes)],
    });

    await wizard.prompt();

    if (wizardContext.azureWebJobsStorageType && wizardContext.azureWebJobsStorageType !== ConnectionType.Emulator) {
        await wizard.execute();
    }
}
