/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DurableBackend } from "../../../../../../extension.bundle";
import { durableOrchestratorName, durableOrchestratorPick } from "../../../../../constants";
import { ConnectionType, CreateMode, OperatingSystem, PlanType, Runtime } from "../../../../../utils/createFunctionAppUtils";
import { type AzExtFunctionsTestScenario } from "../../AzExtFunctionsTestScenario";
import { generateCreateAndDeployTest } from "../generateCreateAndDeployTest";

export function generateJSNodeScenario(): AzExtFunctionsTestScenario {
    const folderName: string = 'scenarios-durable-azurestorage-jsnode';

    return {
        label: 'durable-azurestorage-jsnode',
        folderName,
        createNewProjectTest: {
            label: 'create-new-project',
            inputs: [
                /JavaScript/i,
                /v4/i,
                durableOrchestratorPick,
                /Azure Storage/i,
                durableOrchestratorName,
            ],
        },
        createAndDeployTests: [
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
    };
}
