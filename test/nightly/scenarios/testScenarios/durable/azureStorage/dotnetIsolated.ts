/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DurableBackend } from "../../../../../../extension.bundle";
import { cSharpLanguagePick, dotnetIsolatedPick, dotnetNamespaceName, durableAzureStoragePick, durableOrchestratorName, durableOrchestratorPick } from "../../../../../constants";
import { ConnectionType, CreateMode, OperatingSystem, PlanType, Runtime } from "../../../../../utils/createFunctionAppUtils";
import { type AzExtFunctionsTestScenario } from "../../AzExtFunctionsTestScenario";
import { generateCreateAndDeployTest } from "../generateCreateAndDeployTest";

export function generateDotnetIsolatedScenario(): AzExtFunctionsTestScenario {
    const folderName: string = 'scenario-durable-azurestorage-dotnetisolated';

    return {
        label: 'durable-azurestorage-dotnetisolated',
        folderName,
        createNewProjectTest: {
            label: 'create-new-project',
            inputs: [
                cSharpLanguagePick,
                // Todo: This needs to also run a match on the description because isolated vs. inproc differentiates there
                dotnetIsolatedPick,
                durableOrchestratorPick,
                durableAzureStoragePick,
                durableOrchestratorName,
                dotnetNamespaceName,
            ],
        },
        createAndDeployTests: [
            generateCreateAndDeployTest(folderName, CreateMode.Basic, Runtime.DotNetIsolated, ConnectionType.ManagedIdentity, PlanType.FlexConsumption, OperatingSystem.Linux, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.DotNetIsolated, ConnectionType.ManagedIdentity, PlanType.Premium, OperatingSystem.Linux, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.DotNetIsolated, ConnectionType.ManagedIdentity, PlanType.Premium, OperatingSystem.Windows, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.DotNetIsolated, ConnectionType.ManagedIdentity, PlanType.LegacyConsumption, OperatingSystem.Linux, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.DotNetIsolated, ConnectionType.ManagedIdentity, PlanType.LegacyConsumption, OperatingSystem.Windows, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.DotNetIsolated, ConnectionType.ManagedIdentity, PlanType.AppService, OperatingSystem.Linux, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.DotNetIsolated, ConnectionType.ManagedIdentity, PlanType.AppService, OperatingSystem.Windows, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.DotNetIsolated, ConnectionType.Secrets, PlanType.FlexConsumption, OperatingSystem.Linux, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.DotNetIsolated, ConnectionType.Secrets, PlanType.Premium, OperatingSystem.Linux, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.DotNetIsolated, ConnectionType.Secrets, PlanType.Premium, OperatingSystem.Windows, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.DotNetIsolated, ConnectionType.Secrets, PlanType.LegacyConsumption, OperatingSystem.Linux, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.DotNetIsolated, ConnectionType.Secrets, PlanType.LegacyConsumption, OperatingSystem.Windows, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.DotNetIsolated, ConnectionType.Secrets, PlanType.AppService, OperatingSystem.Linux, DurableBackend.Storage),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.DotNetIsolated, ConnectionType.Secrets, PlanType.AppService, OperatingSystem.Windows, DurableBackend.Storage),
        ],
    };
}
