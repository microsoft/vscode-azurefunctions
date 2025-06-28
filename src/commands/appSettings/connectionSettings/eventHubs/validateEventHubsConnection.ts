/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizard, type AzureWizardExecuteStep, type AzureWizardPromptStep, type IActionContext } from "@microsoft/vscode-azext-utils";
import * as path from "path";
import { CodeAction, ConnectionKey, hostFileName, localEventHubsEmulatorConnectionRegExp } from "../../../../constants";
import { type IHostJsonV2, type INetheriteTaskJson } from "../../../../funcConfig/host";
import { getLocalSettingsConnectionString } from "../../../../funcConfig/local.settings";
import { NetheriteConfigureHostStep } from "../../../createFunction/durableSteps/netherite/NetheriteConfigureHostStep";
import { NetheriteEventHubNameStep } from "../../../createFunction/durableSteps/netherite/NetheriteEventHubNameStep";
import { type IConnectionPromptOptions } from "../IConnectionPromptOptions";
import { type ISetConnectionSettingContext } from "../ISetConnectionSettingContext";
import { EventHubsConnectionListStep } from "./EventHubsConnectionListStep";
import { EventHubsSetSettingStep } from "./EventHubsSetSettingStep";
import { type IEventHubsConnectionWizardContext } from "./IEventHubsConnectionWizardContext";

// Supports validation on both 'debug' and 'deploy'
export async function validateEventHubsConnection(context: Omit<ISetConnectionSettingContext, 'projectPath'>, projectPath: string, options?: IConnectionPromptOptions): Promise<void> {
    const eventHubsConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.EventHubs, projectPath);
    const eventHubName: string | undefined = await getEventHubName(projectPath);

    if (!!eventHubsConnection && !!eventHubName) {
        if (context.action === CodeAction.Deploy) {
            if (!localEventHubsEmulatorConnectionRegExp.test(eventHubsConnection)) {
                // Found a valid connection in deploy mode. Set it and skip the wizard.
                context[ConnectionKey.EventHubs] = eventHubsConnection;
                return;
            }
            // Found an invalid connection for deploy mode, we need to proceed with acquiring a connection through the wizard...
        } else {
            // Found a valid connection in debug mode.  Skip the wizard.
            return;
        }
    }

    const wizardContext: IActionContext = Object.assign(context, { projectPath });
    const promptSteps: AzureWizardPromptStep<IEventHubsConnectionWizardContext>[] = [];
    const executeSteps: AzureWizardExecuteStep<IEventHubsConnectionWizardContext>[] = [];

    if (!eventHubsConnection || localEventHubsEmulatorConnectionRegExp.test(eventHubsConnection)) {
        promptSteps.push(new EventHubsConnectionListStep(options));
        executeSteps.push(new EventHubsSetSettingStep());
    }

    if (!eventHubName) {
        promptSteps.push(new NetheriteEventHubNameStep());
    }

    executeSteps.push(new NetheriteConfigureHostStep());

    const wizard: AzureWizard<IEventHubsConnectionWizardContext> = new AzureWizard(wizardContext, {
        promptSteps,
        executeSteps
    });

    await wizard.prompt();
    await wizard.execute();
}

export async function getEventHubName(projectPath: string): Promise<string | undefined> {
    const hostJsonPath = path.join(projectPath, hostFileName);
    if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
        return undefined;
    }

    const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath);
    const taskJson: INetheriteTaskJson = hostJson.extensions?.durableTask as INetheriteTaskJson;
    return taskJson?.hubName;
}
