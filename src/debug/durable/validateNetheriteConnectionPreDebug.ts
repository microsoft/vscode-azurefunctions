/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type IDTSConnectionWizardContext } from "../../commands/appSettings/connectionSettings/durableTaskScheduler/IDTSConnectionWizardContext";
import { EventHubsConnectionListStep } from "../../commands/appSettings/connectionSettings/eventHubs/EventHubsConnectionListStep";
import { CodeAction, ConnectionType } from "../../constants";
import { localize } from "../../localize";

export async function validateNetheriteConnectionPreDebug(context: IActionContext, projectPath: string): Promise<void> {
    const projectPathContext = Object.assign(context, { projectPath });
    const { dtsConnectionKey } = await getDTSHostConnectionKeys(projectPathContext) ?? {};
    const { dtsConnectionValue: dtsConnection } = await getDTSLocalSettingsValues(projectPathContext, { dtsConnectionKey }) ?? {};

    if (dtsConnection && await isAliveConnection(context, dtsConnection)) {
        return;
    }

    const availableDebugConnectionTypes: Set<Exclude<ConnectionType, 'Custom'>> = new Set([ConnectionType.Azure, ConnectionType.Emulator]);

    const wizardContext: IDTSConnectionWizardContext = Object.assign(context, {
        projectPath,
        action: CodeAction.Debug,
    });

    const wizard: AzureWizard<IDTSConnectionWizardContext> = new AzureWizard(wizardContext, {
        title: localize('acquireDTSConnection', 'Acquire DTS connection'),
        promptSteps: [new EventHubsConnectionListStep(availableDebugConnectionTypes)],
    });

    await wizard.prompt();
    await wizard.execute();

    useDTSEmulator = wizardContext.dtsConnectionType === ConnectionType.Emulator;
}
