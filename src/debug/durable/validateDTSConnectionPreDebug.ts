/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, type IActionContext } from "@microsoft/vscode-azext-utils";
import { DTSConnectionListStep } from "../../commands/appSettings/connectionSettings/durableTaskScheduler/DTSConnectionListStep";
import { type IDTSConnectionWizardContext } from "../../commands/appSettings/connectionSettings/durableTaskScheduler/IDTSConnectionWizardContext";
import { CodeAction, ConnectionKey, ConnectionType } from "../../constants";
import { getLocalSettingsConnectionString } from "../../funcConfig/local.settings";
import { localize } from "../../localize";
import { requestUtils } from "../../utils/requestUtils";

// If the user previously chose to debug using the emulator, leverage that preference for the remaining VS Code session
let useDTSEmulator: boolean;

export async function validateDTSConnectionPreDebug(context: IActionContext, projectPath: string): Promise<void> {
    const dtsConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.DTS, projectPath);
    if (dtsConnection && await isAliveConnection(context, dtsConnection)) {
        return;
    }

    const availableDebugConnectionTypes = new Set([ConnectionType.Emulator, ConnectionType.Custom]);

    const wizardContext: IDTSConnectionWizardContext = Object.assign(context, {
        projectPath,
        action: CodeAction.Debug,
        dtsConnectionType: useDTSEmulator ? ConnectionType.Emulator : undefined,
    });

    const wizard: AzureWizard<IDTSConnectionWizardContext> = new AzureWizard(wizardContext, {
        title: localize('acquireDTSConnection', 'Acquire DTS connection'),
        promptSteps: [new DTSConnectionListStep(availableDebugConnectionTypes)],
    });

    await wizard.prompt();
    await wizard.execute();

    useDTSEmulator = wizardContext.dtsConnectionType === ConnectionType.Emulator;
}

/**
 * Checks whether a given DTS connection is still alive (i.e. has not gone stale)
 */
export async function isAliveConnection(context: IActionContext, dtsConnection: string): Promise<boolean> {
    // We need to extract the endpoint from a string like: Endpoint=http://localhost:55053/;Authentication=None
    const endpointMatch = dtsConnection.match(/Endpoint=([^;]+)/);
    if (!endpointMatch) {
        return false;
    }

    try {
        const url: string = endpointMatch[1];
        await requestUtils.sendRequestWithExtTimeout(context, { url, method: 'GET' });
        return true;
    } catch (e) {
        // Even if we get back an error, if we can read a status code, the connection provided a response and is still alive
        const statusCode = (e as { statusCode?: number })?.statusCode;
        return !!statusCode;
    }
}
