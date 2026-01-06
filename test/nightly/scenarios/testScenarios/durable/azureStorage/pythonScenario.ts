/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DurableBackend } from "../../../../../../extension.bundle";
import { durableOrchestratorName, durableOrchestratorPick, pythonDefaultPick } from "../../../../../constants";
import { ConnectionType, CreateMode, OperatingSystem, PlanType, Runtime } from "../../../../../utils/createFunctionAppUtils";
import { type AzExtFunctionsTestScenario } from "../../AzExtFunctionsTestScenario";
import { generateCreateAndDeployTest } from "../generateCreateAndDeployTest";

export function generatePythonScenario(): AzExtFunctionsTestScenario {
    const folderName: string = 'scenarios-durable-azurestorage-python';

    return {
        label: 'durable-azurestorage-python',
        folderName,
        createNewProjectTest: {
            label: 'create-new-project',
            inputs: [
                /Python/i,
                /v2/i,
                pythonDefaultPick,
                durableOrchestratorPick,
                /Azure Storage/i,
                durableOrchestratorName,
            ],
        },
        createAndDeployTests: [
            generateCreateAndDeployTest(folderName, CreateMode.Basic, Runtime.Python, ConnectionType.ManagedIdentity, PlanType.FlexConsumption, OperatingSystem.Linux, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Python, ConnectionType.ManagedIdentity, PlanType.Premium, OperatingSystem.Windows, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Python, ConnectionType.Secrets, PlanType.FlexConsumption, OperatingSystem.Linux, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Python, ConnectionType.Secrets, PlanType.Premium, OperatingSystem.Windows, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Python, ConnectionType.Secrets, PlanType.LegacyConsumption, OperatingSystem.Linux, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Python, ConnectionType.Secrets, PlanType.AppService, OperatingSystem.Windows, DurableBackend.Storage),
        ],
    };
}
