/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type WebSiteManagementClient } from '@azure/arm-appservice';
import { type ServiceClient } from '@azure/core-client';
import { createHttpHeaders, createPipelineRequest, type PipelineRequest, type PipelineResponse } from '@azure/core-rest-pipeline';
import { createGenericClient } from '@microsoft/vscode-azext-azureutils';
import { createTestActionContext, type TestActionContext, type TestAzureAccount } from '@microsoft/vscode-azext-dev';
import { longRunningTestsEnabled } from '../global.test';

export let testAccount: TestAzureAccount;
export let testClient: WebSiteManagementClient;
export const resourceGroupsToDelete: string[] = [];

// Runs before all nightly tests
suiteSetup(async function (this: Mocha.Context): Promise<void> {
    if (longRunningTestsEnabled) {
        // this.timeout(2 * 60 * 1000);
        console.log('TEST TEST RUNNING NIGHTLY TESTSS!!');

        if (!process.env.AGENT_BUILDDIRECTORY) {
            // Assume that AGENT_BUILDDIRECTORY is set if running in an Azure DevOps pipeline.
            // So when not running in an Azure DevOps pipeline, throw an error since we cannot use the DevOps federated service connection credential.
            // @todo: use interactive browser credential from @azure/identity to enable running of tests locally (assuming the developer has the necessary permissions).
            throw new Error(`Cannot create DevOps federated service connection credential outside of an Azure DevOps pipeline.`);
        } else {
            console.log(`Creating DevOps federated service connection credential for service connection..`);

            // Pre-defined DevOps variable reference: https://learn.microsoft.com/en-us/azure/devops/pipelines/build/variables?view=azure-devops
            const systemAccessToken = process.env.SYSTEM_ACCESSTOKEN;
            const teamFoundationCollectionUri = process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI;
            const teamProjectId = process.env.SYSTEM_TEAMPROJECTID;
            const planId = process.env.SYSTEM_PLANID;
            const jobId = process.env.SYSTEM_JOBID;
            if (!systemAccessToken || !teamFoundationCollectionUri || !teamProjectId || !planId || !jobId) {
                throw new Error(`Azure DevOps environment variables are not set.\n
                process.env.SYSTEM_ACCESSTOKEN: ${process.env.SYSTEM_ACCESSTOKEN ? "✅" : "❌"}\n
                process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI: ${process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI ? "✅" : "❌"}\n
                process.env.SYSTEM_TEAMPROJECTID: ${process.env.SYSTEM_TEAMPROJECTID ? "✅" : "❌"}\n
                process.env.SYSTEM_PLANID: ${process.env.SYSTEM_PLANID ? "✅" : "❌"}\n
                process.env.SYSTEM_JOBID: ${process.env.SYSTEM_JOBID ? "✅" : "❌"}\n
                REMEMBER: process.env.SYSTEM_ACCESSTOKEN must be explicitly mapped!\n
                https://learn.microsoft.com/en-us/azure/devops/pipelines/build/variables?view=azure-devops&tabs=yaml#systemaccesstoken
            `);
            }

            const serviceConnectionId = "816925d8-6f4a-4b37-8c74-1c16efe33e27";
            const domain = "72f988bf-86f1-41af-91ab-2d7cd011db47";
            const clientId = "a581a512-0b3b-43b0-bb17-39e24d998b0a";

            const oidcRequestUrl = `${teamFoundationCollectionUri}${teamProjectId}/_apis/distributedtask/hubs/build/plans/${planId}/jobs/${jobId}/oidctoken?api-version=7.1-preview.1&serviceConnectionId=${serviceConnectionId}`;

            const { ClientAssertionCredential } = await import("@azure/identity");
            const credentials = new ClientAssertionCredential(domain, clientId, () => requestOidcToken(oidcRequestUrl, systemAccessToken));
            console.log('WE HAVE CREDENTIALS NOW???');
            console.log(`credentials: ${credentials}`);
        }


        // testAccount = new TestAzureAccount(vscode);
        // await testAccount.signIn();
        // ext.azureAccountTreeItem = new AzureAccountTreeItemWithProjects(testAccount);
        // testClient = createAzureClient([await createTestActionContext(), testAccount.getSubscriptionContext()], WebSiteManagementClient);
    }
});

suiteTeardown(async function (this: Mocha.Context): Promise<void> {
    if (longRunningTestsEnabled) {
        // this.timeout(10 * 60 * 1000);

        // await deleteResourceGroups();
        // ext.azureAccountTreeItem.dispose();
    }
});

/**
 * API reference: https://learn.microsoft.com/en-us/rest/api/azure/devops/distributedtask/oidctoken/create
 */
async function requestOidcToken(oidcRequestUrl: string, systemAccessToken: string): Promise<string> {
    // const requestOptions = {
    //     url: oidcRequestUrl,
    //     method: "POST",
    //     headers: {
    //         "Content-Type": "application/json",
    //         "Authorization": `Bearer ${systemAccessToken}`
    //     },
    // };
    // console.log(`Requesting OIDC token from ${oidcRequestUrl}`);
    // const response = await Net.requestAndAwaitResponse(requestOptions);
    // const body = await response.responseText();

    const dummyContext: TestActionContext = await createTestActionContext();
    const client: ServiceClient = await createGenericClient(dummyContext, undefined);
    const request: PipelineRequest = createPipelineRequest({
        url: oidcRequestUrl,
        method: "POST",
        headers: createHttpHeaders({
            "Content-Type": "application/json",
            "Authorization": `Bearer ${systemAccessToken}`
        })
    });

    const response: PipelineResponse = await client.sendRequest(request);
    const body: string = response.bodyAsText?.toString() || "";


    if (response.status !== 200) {
        throw new Error(`Failed to get OIDC token:\n
            Response status: ${response.status}\n
            Response body: ${body}\n
            Response headers: ${JSON.stringify(response.headers.toJSON())}
        `);
    } else {
        console.log(`Successfully got OIDC token with status ${response.status}`);
    }
    return JSON.parse(body).oidcToken;
}


// async function deleteResourceGroups(): Promise<void> {
//     const rgClient: ResourceManagementClient = createAzureClient([await createTestActionContext(), testAccount.getSubscriptionContext()], ResourceManagementClient);
//     await Promise.all(resourceGroupsToDelete.map(async resourceGroup => {
//         if ((await rgClient.resourceGroups.checkExistence(resourceGroup)).body) {
//             console.log(`Started delete of resource group "${resourceGroup}"...`);
//             await rgClient.resourceGroups.beginDeleteAndWait(resourceGroup);
//             console.log(`Successfully started delete of resource group "${resourceGroup}".`);
//         } else {
//             // If the test failed, the resource group might not actually exist
//             console.log(`Ignoring resource group "${resourceGroup}" because it does not exist.`);
//         }
//     }));
// }
