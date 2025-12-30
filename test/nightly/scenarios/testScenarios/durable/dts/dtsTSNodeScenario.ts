/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DurableBackend, getRandomAlphanumericString } from "../../../../../../extension.bundle";
import { ConnectionType, createFunctionAppUtils, CreateMode, OperatingSystem, PlanType } from "../../../../../utils/createFunctionAppUtils";
import { deployFunctionAppUtils } from "../../../../../utils/deployFunctionAppUtils";
import { type AzExtFunctionsTestScenario, type CreateAndDeployTestCase } from "../../AzExtFunctionsTestScenario";

export function generateTSNodeScenario(): AzExtFunctionsTestScenario {
    const folderName: string = 'scenarios-durable-dts-tsnode';

    return {
        label: 'durable-dts-tsnode',
        folderName,
        createNewProjectTest: {
            label: 'create-new-project',
            inputs: [
                /TypeScript/i,
                /v4/i,
                /Durable Functions Orchestrator/i,
                /Durable Task Scheduler/i,
                'durableHello1',
            ],
        },
        createAndDeployTests: [
            generateCreateAndDeployTest(folderName, CreateMode.Basic, ConnectionType.ManagedIdentity, OperatingSystem.Linux, PlanType.FlexConsumption),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, ConnectionType.ManagedIdentity, OperatingSystem.Linux, PlanType.Premium),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, ConnectionType.ManagedIdentity, OperatingSystem.Windows, PlanType.Premium),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, ConnectionType.Secrets, OperatingSystem.Linux, PlanType.FlexConsumption),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, ConnectionType.Secrets, OperatingSystem.Linux, PlanType.Premium),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, ConnectionType.Secrets, OperatingSystem.Windows, PlanType.Premium),
        ],
    };
}

function generateCreateAndDeployTest(folderName: string, createMode: CreateMode, connection: ConnectionType, os: OperatingSystem, plan: PlanType): CreateAndDeployTestCase {
    const appName: string = getRandomAlphanumericString();
    const description: string = `${createMode}-${connection}-${os}-${plan}`;

    return {
        createFunctionApp: {
            label: `create-function-app-${description}`,
            mode: createMode,
            inputs: createMode === CreateMode.Basic ?
                createFunctionAppUtils.generateBasicCreateInputs(appName, folderName, connection) :
                createFunctionAppUtils.generateAdvancedCreateInputs(appName, folderName, connection, os, plan),
        },
        deployFunctionApp: {
            label: `deploy-function-app-${description}`,
            inputs: deployFunctionAppUtils.generateDurableDeployInputs(appName, DurableBackend.DTS),
        },
        resourceGroupsToDelete: [appName],
    };
}
