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

function getNumericallyLabeledBenchmarkConfig(config: AgentBenchmarkConfig, numericalLabel: number): AgentBenchmarkConfig {
    return {
        ...config,
        name: `${config.name} ${numericalLabel}`
    };
}

function getLearnBenchmarkConfigs(): AgentBenchmarkConfig[] {
    return ([
        {
            name: "Learn - How to run code on blob change",
            prompt: "How can I use azure functions to run code whenever a blob is changed?",
            acceptableHandlerChains: [
                ["functions", "learn"],
            ],
        },
        {
            name: "Learn - Functions vs WebApps",
            prompt: "How do I write a lambda in Azure?",
            acceptableHandlerChains: [
                ["functions", "learn"],
            ],
        }
    ]).map((config, index) => getNumericallyLabeledBenchmarkConfig(config, index + 1));
}

function getCreateFunctionAppBenchmarkConfigs(): AgentBenchmarkConfig[] {
    const createFunctionAppBenchmarkName = "Create Function App";
    return ([
        {
            name: createFunctionAppBenchmarkName,
            prompt: "I want to create a function app",
            acceptableHandlerChains: [
                ["functions", createFunctionAppCommandName],
            ],
        },
        {
            name: createFunctionAppBenchmarkName,
            prompt: "I want to create a func app",
            acceptableHandlerChains: [
                ["functions", createFunctionAppCommandName],
            ],
        },
        {
            name: createFunctionAppBenchmarkName,
            prompt: "I want to create a resource that lets me run serverless code",
            acceptableHandlerChains: [
                ["functions", createFunctionAppCommandName],
            ],
        },
        {
            name: createFunctionAppBenchmarkName,
            prompt: "create func app",
            acceptableHandlerChains: [
                ["functions", createFunctionAppCommandName],
            ],
        },
        {
            name: createFunctionAppBenchmarkName,
            prompt: "func app create",
            acceptableHandlerChains: [
                ["functions", createFunctionAppCommandName],
            ],
        },
        {
            name: createFunctionAppBenchmarkName,
            prompt: "Hi, I would like you to create for me a very specific type of resource, that of course being an azure function app. Thank you!",
            acceptableHandlerChains: [
                ["functions", createFunctionAppCommandName],
            ],
        },
        {
            name: createFunctionAppBenchmarkName,
            prompt: "I want to be able to run code, but not pay for compute usage when my code isn't running, can you create a resource that helps me do that?",
            acceptableHandlerChains: [
                ["functions", createFunctionAppCommandName],
            ],
        }
    ]).map((config, index) => getNumericallyLabeledBenchmarkConfig(config, index + 1));
}

function getCreateFunctionProjectBenchmarkConfigs(): AgentBenchmarkConfig[] {
    const createFunctionProjectBenchmarkName = "Create Function Project";
    return ([
        {
            name: createFunctionProjectBenchmarkName,
            prompt: "Create a new function project",
            acceptableHandlerChains: [
                ["functions", createFunctionProjectCommandName],
            ]
        },
        {
            name: createFunctionProjectBenchmarkName,
            prompt: "Create a function app locally without deploying it",
            acceptableHandlerChains: [
                ["functions", createFunctionProjectCommandName],
            ]
        },
        {
            name: createFunctionProjectBenchmarkName,
            prompt: "Generate files for an example function app so I get started creating my own",
            acceptableHandlerChains: [
                ["functions", createFunctionProjectCommandName],
            ]
        }
    ]).map((config, index) => getNumericallyLabeledBenchmarkConfig(config, index + 1));
}

function getDeployToFunctionAppBenchmarkConfigs(): AgentBenchmarkConfig[] {
    const deployToFunctionAppBenchmarkName = "Deploy to Function App";
    return ([
        {
            name: deployToFunctionAppBenchmarkName,
            prompt: "Deploy my function app",
            acceptableHandlerChains: [
                ["functions", deployToFunctionAppCommandName]
            ]
        },
        {
            name: deployToFunctionAppBenchmarkName,
            prompt: "Push my function app to Azure",
            acceptableHandlerChains: [
                ["functions", deployToFunctionAppCommandName]
            ]
        },
        {
            name: deployToFunctionAppBenchmarkName,
            prompt: "I have finished developing a function project locally. What should I do to make it run on Azure?",
            acceptableHandlerChains: [
                ["functions", deployToFunctionAppCommandName]
            ]
        }
    ]).map((config, index) => getNumericallyLabeledBenchmarkConfig(config, index + 1));
}

export function getAgentBenchmarkConfigs(): AgentBenchmarkConfig[] {
    return [
        ...getLearnBenchmarkConfigs(),
        ...getCreateFunctionAppBenchmarkConfigs(),
        ...getCreateFunctionProjectBenchmarkConfigs(),
        ...getDeployToFunctionAppBenchmarkConfigs()
    ];
}
