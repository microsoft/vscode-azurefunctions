/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzExtUserInputWithInputQueue, callWithTelemetryAndErrorHandling, type AgentBenchmarkConfig, type AzureUserInputQueue, type IAzureUserInput, type SimpleCommandConfig, type WizardCommandConfig } from '@microsoft/vscode-azext-utils';
import { createFunctionApp } from '../commands/createFunctionApp/createFunctionApp';

const createFunctionAppCommandName = "createFunctionApp";
const createFunctionProjectCommandName = "createFunctionProject";
const deployToFunctionAppCommandName = "deployToFunctionApp";

export async function getCommands(): Promise<(WizardCommandConfig | SimpleCommandConfig)[]> {
    return [
        {
            type: "wizard",
            name: createFunctionAppCommandName,
            commandId: "azureFunctions.createFunctionApp",
            displayName: "Create Function App",
            intentDescription: "This is best when users ask to create a Function App resource in Azure. They may refer to a Function App as 'Function App', 'function', 'function resource', 'function app resource', 'function app' etc. This command is not useful if the user is asking how to do something, or if something is possible.",
            requiresAzureLogin: true,
        },
        {
            type: "simple",
            name: createFunctionProjectCommandName,
            commandId: "azureFunctions.createFunction",
            displayName: "Create Function Locally",
            intentDescription: "This is best when users ask to create a new function project in VS Code. They may also refer to creating a function project by asking to create a project based upon a function project template.",
            requiresAzureLogin: true,
        },
        {
            type: "simple",
            name: deployToFunctionAppCommandName,
            commandId: "azureFunctions.deploy",
            displayName: "Deploy to Function App",
            intentDescription: "This is best when users ask to create a deploy their function project or their code to a function app. They may refer to a Function App as 'Function App', 'function', 'function resource', 'function app resource', 'function app' etc. This is not best if they ask to deploy to a slot.",
            requiresAzureLogin: true,
        },
    ];
}

export async function runWizardCommandWithoutExecution(command: WizardCommandConfig, ui: IAzureUserInput): Promise<void> {
    if (command.commandId === 'azureFunctions.createFunctionApp') {
        await callWithTelemetryAndErrorHandling('azureFunctions.createFunctionAppViaAgent', async (context) => {
            return await createFunctionApp({ ...context, ui: ui, skipExecute: true });
        });
    } else {
        throw new Error('Unknown command: ' + command.commandId);
    }
}

export async function runWizardCommandWithInputs(command: WizardCommandConfig, inputsQueue: AzureUserInputQueue): Promise<void> {
    if (command.commandId === 'azureFunctions.createFunctionApp') {
        await callWithTelemetryAndErrorHandling('azureFunctions.createFunctionAppViaAgent', async (context) => {
            const azureUserInput = new AzExtUserInputWithInputQueue(context, inputsQueue);
            return await createFunctionApp({ ...context, ui: azureUserInput });
        });
    } else {
        throw new Error('Unknown command: ' + command.commandId);
    }
}

export function getAgentBenchmarkConfigs(): AgentBenchmarkConfig[] {
    return [
        {
            name: "Learn 1 - How to run code on blob change",
            prompt: "How can I use azure functions to run code whenever a blob is changed?",
            acceptableHandlerChains: [
                ["functions", "learn"],
            ],
        },
        {
            name: "Learn 2 - Functions vs WebApps",
            prompt: "How do I write a lambda in Azure?",
            acceptableHandlerChains: [
                ["functions", "learn"],
            ],
        },
        {
            name: "Create Function App 1",
            prompt: "I want to create a function app",
            acceptableHandlerChains: [
                ["functions", createFunctionAppCommandName],
            ],
        },
        {
            name: "Create Function App 2",
            prompt: "I want to create a func app",
            acceptableHandlerChains: [
                ["functions", createFunctionAppCommandName],
            ],
        },
        {
            name: "Create Function App 3",
            prompt: "I want to create a resource that lets me run serverless code",
            acceptableHandlerChains: [
                ["functions", createFunctionAppCommandName],
            ],
        },
        {
            name: "Create Function App 4",
            prompt: "create func app",
            acceptableHandlerChains: [
                ["functions", createFunctionAppCommandName],
            ],
        },
        {
            name: "Create Function App 5",
            prompt: "func app create",
            acceptableHandlerChains: [
                ["functions", createFunctionAppCommandName],
            ],
        },
        {
            name: "Create Function App 5",
            prompt: "Hi, I would like you to create for me a very specific type of resource, that of course being an azure function app. Thank you!",
            acceptableHandlerChains: [
                ["functions", createFunctionAppCommandName],
            ],
        },
        {
            name: "Create Function App 6",
            prompt: "I want to be able to run code, but not pay for compute usage when my code isn't running, can you create a resource that helps me do that?",
            acceptableHandlerChains: [
                ["functions", createFunctionAppCommandName],
            ],
        }
    ];
}
