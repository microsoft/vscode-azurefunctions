/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DurableBackend } from "../../../../../../extension.bundle";
import { durableAzureStoragePick, durableOrchestratorName, durableOrchestratorPick, pythonLanguagePick, pythonModelV2Pick, pythonRuntimePick } from "../../../../../constants";
import { ConnectionType, CreateMode, PlanType, Runtime } from "../../../../../utils/createFunctionAppUtils";
import { type AzExtFunctionsTestScenario } from "../../AzExtFunctionsTestScenario";
import { generateCreateAndDeployTest } from "../generateCreateAndDeployTest";

export function generatePythonScenario(): AzExtFunctionsTestScenario {
    const folderName: string = 'scenario-durable-azurestorage-python';

    return {
        label: 'durable-azurestorage-python',
        folderName,
        createNewProjectTest: {
            label: 'create-new-project',
            inputs: [
                pythonLanguagePick,
                pythonModelV2Pick,
                pythonRuntimePick,
                durableOrchestratorPick,
                durableAzureStoragePick,
                durableOrchestratorName,
            ],
        },
        createAndDeployTests: [
            // OS gets automatically defaulted to Linux
            generateCreateAndDeployTest(folderName, CreateMode.Basic, Runtime.Python, ConnectionType.ManagedIdentity, PlanType.FlexConsumption, undefined /** os */, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Python, ConnectionType.ManagedIdentity, PlanType.Premium, undefined /** os */, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Python, ConnectionType.ManagedIdentity, PlanType.LegacyConsumption, undefined /** os */, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Python, ConnectionType.ManagedIdentity, PlanType.AppService, undefined /** os */, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Python, ConnectionType.Secrets, PlanType.FlexConsumption, undefined /** os */, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Python, ConnectionType.Secrets, PlanType.Premium, undefined /** os */, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Python, ConnectionType.Secrets, PlanType.LegacyConsumption, undefined /** os */, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Python, ConnectionType.Secrets, PlanType.AppService, undefined /** os */, DurableBackend.Storage),
        ],
    };
}
