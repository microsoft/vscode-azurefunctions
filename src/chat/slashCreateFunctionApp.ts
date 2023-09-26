/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDeployPaths, getDeployFsPath } from "@microsoft/vscode-azext-azureappservice";
import { AzureSubscription } from "@microsoft/vscode-azext-azureauth";
import { ISubscriptionContext, callWithTelemetryAndErrorHandling } from "@microsoft/vscode-azext-utils";
import * as vscode from "vscode";
import { IFunctionAppWizardContext } from "../commands/createFunctionApp/IFunctionAppWizardContext";
import { getStackPicks } from "../commands/createFunctionApp/stacks/getStackPicks";
import { tryGetFunctionProjectRoot } from "../commands/createNewProject/verifyIsProject";
import { ext } from '../extensionVariables';
import { addLocalFuncTelemetry } from "../funcCoreTools/getLocalFuncCoreToolsVersion";
import { SubscriptionTreeItem } from "../tree/SubscriptionTreeItem";
import { createActivityContext } from "../utils/activityUtils";
import { VerifiedInit, verifyInitForVSCode } from "../vsCodeConfig/verifyInitForVSCode";
import { AgentSlashCommand, SlashCommandHandlerResult } from "./agent";
import { getBooleanFieldFromCopilotResponseMaybeWithStrJson, getResponseAsStringCopilotInteraction, getStringFieldFromCopilotResponseMaybeWithStrJson } from "./copilotInteractions";

export const createFunctionAppSlashCommand: AgentSlashCommand = [
    "createFunctionApp",
    {
        shortDescription: "Create a Function App",
        longDescription: "Use this command to create a Function App resource in Azure.",
        determineCommandDescription: "This command is best when users explicitly want to create a Function App resource in Azure. They may refer to a Function App as 'Function App', 'function', 'function resource', 'function app resource', 'function app' etc. Users will not use this command when asking if or how to do something with Azure Functions or a Function App.",
        handler: createFunctionAppHandler
    }
];

async function createFunctionAppHandler(userContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.InteractiveProgress>, token: vscode.CancellationToken): Promise<SlashCommandHandlerResult> {
    try {
        const projectInfo = await getCurrentProjectDetails();
        const subscriptionIdOrNamePromise = determineSubscriptionIdOrName(userContent, _ctx, progress, token);
        const regionPromise = determineRegion(userContent, _ctx, progress, token);
        const runtimePromise = determineRuntime(userContent, projectInfo, _ctx, progress, token);

        const subscriptionIdOrName = await subscriptionIdOrNamePromise;
        const region = await regionPromise;
        const runtime = await runtimePromise;

        if (subscriptionIdOrName !== undefined || region !== undefined || runtime !== undefined) {
            if (projectInfo !== undefined) {
                progress.report({ content: new vscode.MarkdownString(`Ok, I can create a Function App for your current project starting with the following details:\n\n`) });
            } else {
                progress.report({ content: new vscode.MarkdownString(`Ok, I can create a Function App for you starting with the following details:\n\n`) });
            }
            if (subscriptionIdOrName !== undefined) {
                progress.report({ content: new vscode.MarkdownString(`- Subscription: ${subscriptionIdOrName.subscriptionName} (${subscriptionIdOrName.subscriptionId})\n`) });
            }
            if (region !== undefined) {
                progress.report({ content: new vscode.MarkdownString(`- Region: ${region}\n`) });
            }
            if (runtime !== undefined) {
                progress.report({ content: new vscode.MarkdownString(`- Runtime: ${runtime}\n`) });
            }
            progress.report({ content: new vscode.MarkdownString(`\nIf that looks good to you, click 'Create Function App' to begin. If not, you can create a Function App via the command palette instead.\n`) });
        }
        return { chatAgentResult: {}, followUp: [{ title: "Create Function App", commandId: "azureFunctions.createFunctionApp", args: [] }], };
    } catch (e) {
        console.log(e);
    }

    progress.report({ content: new vscode.MarkdownString("Sorry, I can't help with that right now.\n") });
    return { chatAgentResult: {}, followUp: [], };
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function determineUserReferencingCurrentProject(userContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.InteractiveProgress>, token: vscode.CancellationToken): Promise<boolean> {
    const maybeJsonCopilotResponse = await getResponseAsStringCopilotInteraction(createFunctionAppDetermineUserReferencingCurrentProjectPrompt1, userContent, progress, token);
    return getBooleanFieldFromCopilotResponseMaybeWithStrJson(maybeJsonCopilotResponse, "userReferencingCurrentProject") === true;
}

async function determineSubscriptionIdOrName(userContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.InteractiveProgress>, token: vscode.CancellationToken): Promise<{ subscriptionId: string, subscriptionName: string } | undefined> {
    const availableSubscriptions = await getAvailableSubscriptions();
    if (availableSubscriptions === undefined || availableSubscriptions.length === 0) {
        return undefined;
    }

    const maybeJsonCopilotResponse = await getResponseAsStringCopilotInteraction(createFunctionAppDetermineSubscriptionIdOrNameystemPrompt1(availableSubscriptions), userContent, progress, token);
    const subscriptionIdAndOrName = getStringFieldFromCopilotResponseMaybeWithStrJson(maybeJsonCopilotResponse, "subscription") ??
        getStringFieldFromCopilotResponseMaybeWithStrJson(maybeJsonCopilotResponse, "subscriptionId") ??
        getStringFieldFromCopilotResponseMaybeWithStrJson(maybeJsonCopilotResponse, "subscriptionName");

    return callWithTelemetryAndErrorHandling("azureFunctions.chat.validateSubscriptionNameOrId", async (context) => {
        const subsriptionNodeIfId = await ext.rgApi.tree.findTreeItem<(SubscriptionTreeItem & { context: ISubscriptionContext })>(`/subscriptions/${subscriptionIdAndOrName}`, { loadAll: true, ...context });
        if (subsriptionNodeIfId !== undefined) {
            return getSubscriptionInfoFromSubscriptionTreeItem(subsriptionNodeIfId);
        }

        return availableSubscriptions.find((subscription) =>
            subscription.subscriptionId === subscriptionIdAndOrName ||
            subscription.subscriptionName.toLowerCase() === subscriptionIdAndOrName?.toLowerCase() ||
            subscriptionIdAndOrName?.includes(subscription.subscriptionId) ||
            subscriptionIdAndOrName?.includes(subscription.subscriptionName.toLowerCase()));
    });
}

async function getAvailableSubscriptions(): Promise<{ subscriptionName: string, subscriptionId: string }[] | undefined> {
    return callWithTelemetryAndErrorHandling("azureFunctions.chat.getAvailableSubscriptions", async () => {
        const allSubscriptionNodes = await ext.rgApi.tree.getChildren() as (SubscriptionTreeItem & { context: ISubscriptionContext })[];
        return allSubscriptionNodes.map((subscriptionNode) => getSubscriptionInfoFromSubscriptionTreeItem(subscriptionNode));
    });
}

function getSubscriptionInfoFromSubscriptionTreeItem(subscriptionNode: SubscriptionTreeItem): { subscriptionId: string, subscriptionName: string } {
    const subscriptionContext = (subscriptionNode as SubscriptionTreeItem & { context: { subscription: AzureSubscription } }).context;
    return { subscriptionId: subscriptionContext.subscription.subscriptionId, subscriptionName: subscriptionContext.subscription.name };
}

async function determineRegion(userContent: string, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.InteractiveProgress>, token: vscode.CancellationToken): Promise<string | undefined> {
    const maybeJsonCopilotResponse = await getResponseAsStringCopilotInteraction(createFunctionAppDetermineRegionPrompt1, userContent, progress, token);
    return getStringFieldFromCopilotResponseMaybeWithStrJson(maybeJsonCopilotResponse, "region") ??
        getStringFieldFromCopilotResponseMaybeWithStrJson(maybeJsonCopilotResponse, "location");
}

async function determineRuntime(userContent: string, projectInfo: VerifiedInit | undefined, _ctx: vscode.ChatAgentContext, progress: vscode.Progress<vscode.InteractiveProgress>, token: vscode.CancellationToken): Promise<string | undefined> {
    if (projectInfo !== undefined) {
        switch (projectInfo.language) {
            case "TypeScript":
                return "Node.js 18 LTS";
            case "C#":
                return ".NET 7"
            default:
                return undefined;
        }
    } else {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises, @typescript-eslint/no-explicit-any, no-async-promise-executor
        const availableRuntimes = await new Promise<string[]>(async (resolve) => {
            await callWithTelemetryAndErrorHandling("azureFunctions.chat.determineRuntime", async (actionContext) => {
                try {
                    const picks = await getStackPicks({ ...actionContext, version: "~4" } as IFunctionAppWizardContext);
                    resolve(picks
                        .map((pick) => pick.data?.stack.displayText)
                        .filter((displayText): displayText is string => displayText !== undefined)
                    );
                } catch {
                    resolve([]);

                }
            });
        });
        if (availableRuntimes.length === 0) {
            return undefined
        }
        const maybeJsonCopilotResponse = await getResponseAsStringCopilotInteraction(createFunctionAppDetermineRuntimePrompt1(availableRuntimes), userContent, progress, token);
        return getStringFieldFromCopilotResponseMaybeWithStrJson(maybeJsonCopilotResponse, "runtime");
    }
}

async function getCurrentProjectDetails(): Promise<VerifiedInit | undefined> {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises, @typescript-eslint/no-explicit-any, no-async-promise-executor
    return new Promise(async (resolve) => {
        await callWithTelemetryAndErrorHandling("azureFunctions.chat.determineRuntime", async (actionContext) => {
            try {
                const deployPaths: IDeployPaths = await getDeployFsPath(actionContext, undefined);
                addLocalFuncTelemetry(actionContext, deployPaths.workspaceFolder.uri.fsPath);
                const projectPath: string | undefined = await tryGetFunctionProjectRoot(actionContext, deployPaths.workspaceFolder);
                if (projectPath === undefined) {
                    throw new Error("");
                }
                const context = Object.assign(actionContext, deployPaths, {
                    action: "Deploy", // CodeAction.Deploy
                    defaultAppSetting: 'defaultFunctionAppToDeploy',
                    projectPath,
                    ...(await createActivityContext())
                });

                resolve(await verifyInitForVSCode(context, context.effectiveDeployFsPath));
            } catch {
                resolve(undefined);
            }
        });
    });
}

const createFunctionAppDetermineUserReferencingCurrentProjectPrompt1 = `
You are an expert in create Azure Function Apps. The user is trying to create a new Function App. Your job is to determine if the user is asking to create a new Function App for their current project or workspace. Only repsond with a JSON object containing a boolean value. If the user is asking to create a new Function App for their current project or workspace, respond with true. Otherwise, respond with false. Do not respond in a coverstaional tone, only JSON.

## Example 1

User: Create a function app.
Assistant: { "userReferencingCurrentProject": false }

## Example 2

User: Create a function app for my current project.
Assistant: { "userReferencingCurrentProject": true }

## Example 3

User: Create a function app which can run the project which I am currently working on.
Assistant: { "userReferencingCurrentProject": true }

## Example 4

User: Create a function app with a node 18 runtime.
Assistant: { "userReferencingCurrentProject": false }

## Example 5

User: Create a function app with a node 18 runtime for my current project.
Assistant: { "userReferencingCurrentProject": true }
`;

const createFunctionAppDetermineSubscriptionIdOrNameystemPrompt1 = (availableSubscriptions: { subscriptionName: string, subscriptionId: string }[]) => `
You are an expert in creating Azure Function Apps. The user is trying to create a new Function App. Your job is to determine what subscription, either name or ID, they want the new Function App to be created in based on their query. The available subscriptions are: ${availableSubscriptions.map((s) => `'${s.subscriptionName} (${s.subscriptionId})'`).join(",")}. Only repsond with a JSON object containing the subscription name or ID. If their query does not specify a subscription name or ID, respond with an empty JSON object. Do not respond in a coverstaional tone, only JSON.

## Example 1

User: I want to create a function app with the name "contoso-service-func-app" in the subscription "my-subscription".
Assistant: { "subscription": "my-subscription" }

## Example 2

User: I want to create a function app with the name "contoso-service-func-app" in the subscription "d28476d7-53dc-44cb-8d3b-1af2b29658fb".
Assistant: { "subscriptionId": "d28476d7-53dc-44cb-8d3b-1af2b29658fb" }

## Example 3

User: I want to create a function app with the name a node 18 runtime.
Assistant: {}

## Example 4

User: Create a horse resource.
Assistant: {}

## Example 5

User: I want to create a storage account resource with the name "my-storage-account" in the subscription "my-subscription".
Assistant: {}
`;

const createFunctionAppDetermineRegionPrompt1 = `
You are an expert in creating Azure Function Apps. The user is trying to create a new Function App. Your job is to determine either what Azure region they want the new Function App to be created in, or the best Azure region to create the Function App in, based on their query. Only repsond with a JSON object containing the region. If their query does not specify a region, respond with an empty JSON object. Do not respond in a coverstaional tone, only JSON.

## Example 1

User: I want to create a function app with the name "contoso-service-func-app", in the subscription "my-subscription", in eastus2.
Assistant: { "region": "eastus2" }

## Example 2

User: I want to create a function app with the name "contoso-service-func-app" in East US 2.".
Assistant: { "region": "eastus2" }

## Example 3

User: I want to create a function app with the name a node 18 runtime.
Assistant: {}

## Example 4

User: Create a horse resource.
Assistant: {}

## Example 5

User: I want to create a storage account resource with the name "my-storage-account" in the subscription "my-subscription".
Assistant: {}

## Example 6

User: I want to create a function app on near Idaho.
Assistant: { "region": "westus" }

## Example 1

User: I want to create a function app located near the artic circle.
Assistant: { "region": "northeurope" }
`;

const createFunctionAppDetermineRuntimePrompt1 = (availableRuntimes: string[]) => `
You are an expert in creating Azure Function Apps. The user is trying to create a new Function App. Your job is to determine either what runtime they want the Function App to use, or the runtime for the Function App to use based on their query. The available runtimes are: ${availableRuntimes.map((t) => `'${t}'`).join(",")}. Only repsond with a JSON object containing the runtime. If their query does not specify a runtime or you cannot determine a runtime, respond with an empty JSON object. Do not respond in a coverstaional tone, only JSON.

## Example 1

User: I want to create a function app with the name "contoso-service-func-app", in the subscription "my-subscription", in eastus2.
Assistant: { "region": "eastus2" }

## Example 2

User: I want to create a function app with the name "contoso-service-func-app" in East US 2.".
Assistant: { "region": "eastus2" }

## Example 3

User: I want to create a function app with the name a node 18 runtime.
Assistant: {}

## Example 4

User: Create a horse resource.
Assistant: {}

## Example 5

User: I want to create a storage account resource with the name "my-storage-account" in the subscription "my-subscription".
Assistant: {}
`;
