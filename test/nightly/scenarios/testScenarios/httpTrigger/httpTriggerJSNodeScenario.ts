/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { httpTriggerName, httpTriggerPick, jsLanguagePick, jsModelV4Pick } from "../../../../constants";
import { ConnectionType, CreateMode, OperatingSystem, PlanType, Runtime } from "../../../../utils/createFunctionAppUtils";
import { type AzExtFunctionsTestScenario } from "../AzExtFunctionsTestScenario";
import { generateCreateAndDeployTest } from "./generateCreateAndDeployTest";

export function generateJSNodeScenario(): AzExtFunctionsTestScenario {
    const folderName: string = 'scenario-http-trigger-jsnode';

    return {
        label: 'http-trigger-jsnode',
        folderName,
        createNewProjectTest: {
            label: 'create-new-project',
            inputs: [
                jsLanguagePick,
                jsModelV4Pick,
                httpTriggerPick,
                httpTriggerName,
            ],
        },
        createAndDeployTestsCore: [
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.LegacyConsumption, OperatingSystem.Linux),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.AppService, OperatingSystem.Windows),
            // generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.Premium, OperatingSystem.Linux),
        ],
        createAndDeployTestsExtended: [
            generateCreateAndDeployTest(folderName, CreateMode.Basic, Runtime.Node, ConnectionType.ManagedIdentity, PlanType.FlexConsumption, OperatingSystem.Linux),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.ManagedIdentity, PlanType.Premium, OperatingSystem.Linux),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.ManagedIdentity, PlanType.Premium, OperatingSystem.Windows),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.ManagedIdentity, PlanType.LegacyConsumption, OperatingSystem.Linux),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.ManagedIdentity, PlanType.LegacyConsumption, OperatingSystem.Windows),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.ManagedIdentity, PlanType.AppService, OperatingSystem.Linux),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.ManagedIdentity, PlanType.AppService, OperatingSystem.Windows),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.FlexConsumption, OperatingSystem.Linux),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.Premium, OperatingSystem.Linux),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.Premium, OperatingSystem.Windows),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.LegacyConsumption, OperatingSystem.Linux),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.LegacyConsumption, OperatingSystem.Windows),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.AppService, OperatingSystem.Linux),
            generateCreateAndDeployTest(folderName, CreateMode.Advanced, Runtime.Node, ConnectionType.Secrets, PlanType.AppService, OperatingSystem.Windows),
        ],
    };
}
