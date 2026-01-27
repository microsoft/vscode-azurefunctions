/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from "@microsoft/vscode-azext-utils";
import * as assert from "assert";
import * as path from "path";
import { DurableBackend, DurableProjectConfigureStep, hostFileName, type IActionContext, type IHostJsonV2 } from "../../../../../../extension.bundle";
import { durableAzureStoragePick, durableOrchestratorName, durableOrchestratorPick, jsLanguagePick, jsModelV4Pick } from "../../../../../constants";
import { ConnectionType, CreateMode, OperatingSystem, PlanType, Runtime } from "../../../../../utils/createFunctionAppUtils";
import { type AzExtFunctionsTestScenario } from "../../AzExtFunctionsTestScenario";
import { generateCreateAndDeployTest } from "../generateCreateAndDeployTest";

export function generateJSNodeScenario(): AzExtFunctionsTestScenario {
    const folderName: string = 'scenario-durable-azurestorage-jsnode';

    return {
        label: 'durable-azurestorage-jsnode',
        folderName,
        createNewProjectTest: {
            label: 'create-new-project',
            inputs: [
                jsLanguagePick,
                jsModelV4Pick,
                durableOrchestratorPick,
                durableAzureStoragePick,
                durableOrchestratorName,
            ],
            postTest: verifyCreateNewProject,
        },
        createAndDeployTests: {
            basic: [
                generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.LegacyConsumption, OperatingSystem.Linux),
                generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.AppService, OperatingSystem.Windows),
                generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.Premium, OperatingSystem.Linux),
            ],
            extended: [
                // Placeholder...
                // Todo: Will need future discussion & final approval
                generateCreateAndDeployTest(folderName, CreateMode.Basic, Runtime.Node, ConnectionType.ManagedIdentity, PlanType.FlexConsumption, OperatingSystem.Linux, DurableBackend.Storage),
                generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.ManagedIdentity, PlanType.Premium, OperatingSystem.Linux, DurableBackend.Storage),
                generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.ManagedIdentity, PlanType.Premium, OperatingSystem.Windows, DurableBackend.Storage),
                generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.ManagedIdentity, PlanType.LegacyConsumption, OperatingSystem.Linux, DurableBackend.Storage),
                generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.ManagedIdentity, PlanType.LegacyConsumption, OperatingSystem.Windows, DurableBackend.Storage),
                generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.ManagedIdentity, PlanType.AppService, OperatingSystem.Linux, DurableBackend.Storage),
                generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.ManagedIdentity, PlanType.AppService, OperatingSystem.Windows, DurableBackend.Storage),
                generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.FlexConsumption, OperatingSystem.Linux, DurableBackend.Storage),
                generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.Premium, OperatingSystem.Linux, DurableBackend.Storage),
                generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.Premium, OperatingSystem.Windows, DurableBackend.Storage),
                generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.LegacyConsumption, OperatingSystem.Linux, DurableBackend.Storage),
                generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.LegacyConsumption, OperatingSystem.Windows, DurableBackend.Storage),
                generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.AppService, OperatingSystem.Linux, DurableBackend.Storage),
                generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.AppService, OperatingSystem.Windows, DurableBackend.Storage),
            ],
        }
    };
}

async function verifyCreateNewProject(context: IActionContext & { projectPath?: string }): Promise<void> {
    if (!context.projectPath) {
        throw new Error('Internal Error: Test context is missing the requisite project path.');
    }

    const hostJsonPath: string = path.join(context.projectPath, hostFileName);
    const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath) as IHostJsonV2;
    hostJson.extensions ??= {};

    assert.deepStrictEqual(hostJson.extensions.durableTask, DurableProjectConfigureStep.getDefaultStorageTaskConfig(), '');
}
