/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DurableBackend, getRandomAlphanumericString } from "../../../../../extension.bundle";
import { ConnectionType, createFunctionAppUtils, CreateMode, OperatingSystem, PlanType } from "../../../../utils/createFunctionAppUtils";
import { deployFunctionAppUtils } from "../../../../utils/deployFunctionAppUtils";
import { type AzExtFunctionsTestScenario, type CreateAndDeployTestCase } from "../AzExtFunctionsTestScenario";

export function generateTSNodeScenario(): AzExtFunctionsTestScenario {
    const folderName: string = 'scenarios-dts-tsnode';

    return {
        label: 'dts-tsnode',
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
            /** 1. */ generateCreateAndDeployTest(folderName, CreateMode.Basic, ConnectionType.ManagedIdentity, OperatingSystem.Linux, PlanType.FlexConsumption),
            /** 2. */ generateCreateAndDeployTest(folderName, CreateMode.Advanced, ConnectionType.ManagedIdentity, OperatingSystem.Linux, PlanType.Premium),
            /** 3. */ generateCreateAndDeployTest(folderName, CreateMode.Advanced, ConnectionType.ManagedIdentity, OperatingSystem.Windows, PlanType.Premium),
            /** 4. */ generateCreateAndDeployTest(folderName, CreateMode.Advanced, ConnectionType.Secrets, OperatingSystem.Linux, PlanType.FlexConsumption),
            /** 5. */ generateCreateAndDeployTest(folderName, CreateMode.Advanced, ConnectionType.Secrets, OperatingSystem.Linux, PlanType.Premium),
            /** 6. */ generateCreateAndDeployTest(folderName, CreateMode.Advanced, ConnectionType.Secrets, OperatingSystem.Windows, PlanType.Premium),
        ],
    };
}

function generateCreateAndDeployTest(folderName: string, createMode: CreateMode, connection: ConnectionType, os: OperatingSystem, plan: PlanType): CreateAndDeployTestCase {
    const appName: string = getRandomAlphanumericString();

    return {
        createFunctionApp: {
            label: 'create-function-app',
            mode: createMode,
            inputs: createMode === CreateMode.Basic ?
                createFunctionAppUtils.generateBasicCreateInputs(appName, folderName, connection) :
                createFunctionAppUtils.generateAdvancedCreateInputs(appName, folderName, connection, os, plan),
        },
        deployFunctionApp: {
            label: 'deploy-function-app',
            inputs: deployFunctionAppUtils.generateDurableDeployInputs(appName, DurableBackend.DTS),
        },
        resourceGroupToDelete: appName,
    };
}
