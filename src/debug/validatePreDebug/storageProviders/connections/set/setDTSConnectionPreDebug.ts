/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, type ExecuteActivityContext, type IActionContext } from "@microsoft/vscode-azext-utils";
import { DTSConnectionListStep } from "../../../../../commands/appSettings/connectionSettings/durableTaskScheduler/DTSConnectionListStep";
import { getDTSLocalSettingsValues, getDTSSettingsKeys } from "../../../../../commands/appSettings/connectionSettings/durableTaskScheduler/getDTSLocalProjectConnections";
import { type IDTSConnectionWizardContext } from "../../../../../commands/appSettings/connectionSettings/durableTaskScheduler/IDTSConnectionWizardContext";
import { CodeAction, ConnectionType } from "../../../../../constants";
import { localize } from "../../../../../localize";

type UseEmulator = boolean;

export async function setDTSConnectionPreDebugIfNeeded(context: IActionContext & ExecuteActivityContext, projectPath: string): Promise<UseEmulator | undefined> {
    const projectPathContext = Object.assign(context, { projectPath });
    const { dtsConnectionKey, dtsHubConnectionKey } = await getDTSSettingsKeys(projectPathContext) ?? {};
    const {
        dtsConnectionValue: dtsConnection,
        dtsHubConnectionValue: dtsHubConnection,
    } = await getDTSLocalSettingsValues(projectPathContext, { dtsConnectionKey, dtsHubConnectionKey }) ?? {};

    if (dtsConnection && dtsHubConnection) {
        return undefined;
    }

    const availableDebugConnectionTypes = new Set([ConnectionType.Emulator, ConnectionType.Custom]);

    const wizardContext: IDTSConnectionWizardContext = Object.assign(context, {
        projectPath,
        activityChildren: [],
        action: CodeAction.Debug,
        newDTSConnectionSettingKey: dtsConnectionKey,
        newDTSConnectionSettingValue: dtsConnection,
        newDTSHubConnectionSettingKey: dtsHubConnectionKey,
        newDTSHubConnectionSettingValue: dtsHubConnection,
    });

    const wizard: AzureWizard<IDTSConnectionWizardContext> = new AzureWizard(wizardContext, {
        title: localize('prepareDTSConnection', 'Prepare Durable Task Scheduler debug configuration'),
        promptSteps: [new DTSConnectionListStep(availableDebugConnectionTypes)],
    });

    await wizard.prompt();

    if (wizardContext.dtsConnectionType === ConnectionType.Emulator) {
        return true;
    } else if (wizardContext.dtsConnectionType) {
        await wizard.execute();
    }

    return undefined;
}
