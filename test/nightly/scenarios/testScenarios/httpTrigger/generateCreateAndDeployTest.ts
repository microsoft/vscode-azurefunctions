/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site, type WebSiteManagementClient } from "@azure/arm-appservice";
import { createWebSiteClient } from "@microsoft/vscode-azext-azureappservice";
import { parseAzureResourceId, type ParsedAzureResourceId } from "@microsoft/vscode-azext-azureutils";
import { getRandomAlphanumericString, type IActionContext } from "../../../../../extension.bundle";
import { httpTriggerName } from "../../../../constants";
import { createFunctionAppUtils, CreateMode, Runtime, type ConnectionType, type OperatingSystem, type PlanType } from "../../../../utils/createFunctionAppUtils";
import { subscriptionContext } from "../../../global.nightly.test";
import { type CreateAndDeployTestCase } from "../AzExtFunctionsTestScenario";

export function generateCreateAndDeployTest(folderName: string, createMode: CreateMode, runtime: Runtime, connection: ConnectionType, plan: PlanType, os?: OperatingSystem): CreateAndDeployTestCase {
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
            inputs: ['Deploy'],
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
            // case Runtime.Python:
            //     break;
            case Runtime.Node:
                url += `/api/${httpTriggerName}`;
                break;
            // case Runtime.DotNetIsolated:
            //     break;
            default:
                throw new Error('Durable verify deployment not yet implemented for this runtime type.');
        }

        const response = await fetch(url);
        if (response.status !== 200) {
            throw new Error(`Verify Deployment: Http trigger endpoint responded with ${response.status}.`);
        }
    };
}
