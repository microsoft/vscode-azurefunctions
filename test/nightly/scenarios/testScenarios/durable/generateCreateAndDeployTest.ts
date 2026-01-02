/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site, type WebSiteManagementClient } from "@azure/arm-appservice";
import { createWebSiteClient } from "@microsoft/vscode-azext-azureappservice";
import { parseAzureResourceId, type ParsedAzureResourceId } from "@microsoft/vscode-azext-azureutils";
import { getRandomAlphanumericString, type DurableBackend, type IActionContext } from "../../../../../extension.bundle";
import { durableOrchestratorName } from "../../../../constants";
import { createFunctionAppUtils, CreateMode, Runtime, type ConnectionType, type OperatingSystem, type PlanType } from "../../../../utils/createFunctionAppUtils";
import { deployFunctionAppUtils } from "../../../../utils/deployFunctionAppUtils";
import { subscriptionContext } from "../../../global.nightly.test";
import { type CreateAndDeployTestCase } from "../AzExtFunctionsTestScenario";

export function generateCreateAndDeployTest(folderName: string, createMode: CreateMode, runtime: Runtime, connection: ConnectionType, plan: PlanType, os?: OperatingSystem, storageType?: DurableBackend): CreateAndDeployTestCase {
    const appName: string = getRandomAlphanumericString();
    const osDescription: string = os ? `-${os}` : '';
    const description: string = `${createMode}-${connection}${osDescription}-${plan}`;

    return {
        createFunctionApp: {
            label: `create-function-app | ${description}`,
            mode: createMode,
            inputs: createMode === CreateMode.Basic ?
                createFunctionAppUtils.generateBasicCreateInputs(appName, folderName, runtime, connection) :
                createFunctionAppUtils.generateAdvancedCreateInputs(appName, folderName, runtime, connection, plan, os),
        },
        deployFunctionApp: {
            label: `deploy-function-app | ${description}`,
            inputs: deployFunctionAppUtils.generateDurableDeployInputs(appName, storageType),
            postTest: generateVerifyDeployment(runtime),
        },
        resourceGroupsToDelete: [appName],
    };
}

function generateVerifyDeployment(runtime: Runtime) {
    return async function verifyDeployment(context: IActionContext, functionAppId: string): Promise<void> {
        const client: WebSiteManagementClient = await createWebSiteClient({ ...context, ...subscriptionContext });
        const parsedResource: ParsedAzureResourceId = parseAzureResourceId(functionAppId);
        const functionApp: Site = await client.webApps.get(parsedResource.resourceGroup, parsedResource.resourceName);

        let url = `https://${functionApp.defaultHostName}`;
        switch (runtime) {
            case Runtime.Python:
                url += `/api/orchestrators/${durableOrchestratorName}_orchestrator`;
                break;
            case Runtime.Node:
                url += `/api/orchestrators/${durableOrchestratorName}Orchestrator`;
                break;
            case Runtime.DotNet:
                break;
            default:
                throw new Error('Durable verify deployment not yet supported for this runtime type.');
        }

        const response = await fetch(url);
        if (response.status !== 202) {
            throw new Error(`Verify Deployment: Orchestrator endpoint responded with ${response.status}.`);
        }
    };
}
