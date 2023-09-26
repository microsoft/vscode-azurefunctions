/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type WellKnownFunctionProjectLanguage =
    "TypeScript" |
    "C#";
export function isWellKnownFunctionProjectLanguage(language: string | undefined): language is WellKnownFunctionProjectLanguage {
    return language === "TypeScript" || language === "C#";
}

type WellKnownTypeScriptTemplateId =
    "AzureBlobStorageTrigger" |
    "AzureCosmosDBTrigger" |
    "AzureEventGridTrigger" |
    "AzureEventHubTrigger" |
    "AzureQueueStorageTrigger" |
    "AzureServiceBusQueueTrigger" |
    "AzureServiceBusTopicTrigger" |
    "DurableFunctionsEntity" |
    "DurableFunctionsOrchestrator" |
    "HttpTrigger" |
    "TimerTrigger";
type WellKnownTypeScriptTemplateDisplayName =
    "Azure Blob Storage trigger" |
    "Azure Cosmos DB trigger" |
    "Azure Event Grid trigger" |
    "Azure Event Hub trigger" |
    "Azure Queue Storage trigger" |
    "Azure Service Bus Queue trigger" |
    "Azure Service Bus Topic trigger" |
    "Durable Functions entity" |
    "Durable Functions orchestrator" |
    "HTTP trigger" |
    "Timer trigger";
export type WellKnownTypeScriptTemplate = WellKnownTypeScriptTemplateId | WellKnownTypeScriptTemplateDisplayName;
export const wellKnownTypeScriptTemplateDisplayNames: WellKnownTypeScriptTemplateDisplayName[] = [
    "Azure Blob Storage trigger",
    "Azure Cosmos DB trigger",
    "Azure Event Grid trigger",
    "Azure Event Hub trigger",
    "Azure Queue Storage trigger",
    "Azure Service Bus Queue trigger",
    "Azure Service Bus Topic trigger",
    "Durable Functions entity",
    "Durable Functions orchestrator",
    "HTTP trigger",
    "Timer trigger",
];
export const wellKnownTypeScriptTemplateToDisplayNames = new Map<WellKnownTypeScriptTemplate, WellKnownTypeScriptTemplateDisplayName>([
    ["Azure Blob Storage trigger", "Azure Blob Storage trigger"],
    ["Azure Cosmos DB trigger", "Azure Cosmos DB trigger"],
    ["Azure Event Grid trigger", "Azure Event Grid trigger"],
    ["Azure Event Hub trigger", "Azure Event Hub trigger"],
    ["Azure Queue Storage trigger", "Azure Queue Storage trigger"],
    ["Azure Service Bus Queue trigger", "Azure Service Bus Queue trigger"],
    ["Azure Service Bus Topic trigger", "Azure Service Bus Topic trigger"],
    ["AzureBlobStorageTrigger", "Azure Blob Storage trigger"],
    ["AzureCosmosDBTrigger", "Azure Cosmos DB trigger"],
    ["AzureEventGridTrigger", "Azure Event Grid trigger"],
    ["AzureEventHubTrigger", "Azure Event Hub trigger"],
    ["AzureQueueStorageTrigger", "Azure Queue Storage trigger"],
    ["AzureServiceBusQueueTrigger", "Azure Service Bus Queue trigger"],
    ["AzureServiceBusTopicTrigger", "Azure Service Bus Topic trigger"],
    ["Durable Functions entity", "Durable Functions entity"],
    ["Durable Functions orchestrator", "Durable Functions orchestrator"],
    ["DurableFunctionsEntity", "Durable Functions entity"],
    ["DurableFunctionsOrchestrator", "Durable Functions orchestrator"],
    ["HTTP trigger", "HTTP trigger"],
    ["HttpTrigger", "HTTP trigger"],
    ["Timer trigger", "Timer trigger"],
    ["TimerTrigger", "Timer trigger"],
]);
export function getWellKnownTypeScriptTemplate(template: string | undefined): WellKnownTypeScriptTemplate | undefined {
    if (template === undefined) {
        return undefined;
    }
    if (wellKnownTypeScriptTemplateToDisplayNames.has(template as WellKnownTypeScriptTemplate)) {
        return wellKnownTypeScriptTemplateToDisplayNames.get(template as WellKnownTypeScriptTemplate);
    }
    const matchingTemplate = [...wellKnownTypeScriptTemplateToDisplayNames.keys()].find((key) => key.toLowerCase() === template?.toLowerCase() || key.toLowerCase().includes(template?.toLowerCase() ?? ""));
    return matchingTemplate !== undefined ? wellKnownTypeScriptTemplateToDisplayNames.get(matchingTemplate) : undefined;
}
type WellKnownCSharpTemplateId =
    "AzureBlobStorageTrigger" |
    "AzureCosmosDBTrigger" |
    "AzureEventGridTrigger" |
    "AzureEventHubTrigger" |
    "AzureQueueTrigger" |
    "AzureServiceBusQueueTrigger" |
    "AzureServiceBusTopicTrigger" |
    "HttpTrigger" |
    "HttpTriggerWithOpenAPI" |
    "TimerTrigger";
type WellKnownCSharpTemplateDisplayName =
    "Azure Blob Storage trigger" |
    "Azure Cosmos DB trigger" |
    "Azure Event Grid trigger" |
    "Azure Event Hub Trigger" |
    "Azure Queue trigger" |
    "Azure Service Bus Queue trigger" |
    "Azure Service Bus Topic trigger" |
    "HTTP trigger with OpenAPI" |
    "HTTP trigger" |
    "Timer trigger";
export type WellKnownCSharpTemplate = WellKnownCSharpTemplateId | WellKnownCSharpTemplateDisplayName;
export const wellKnownCSharpTemplateDisplayNames: WellKnownCSharpTemplateDisplayName[] = [
    "Azure Blob Storage trigger",
    "Azure Cosmos DB trigger",
    "Azure Event Grid trigger",
    "Azure Event Hub Trigger",
    "Azure Queue trigger",
    "Azure Service Bus Queue trigger",
    "Azure Service Bus Topic trigger",
    "HTTP trigger with OpenAPI",
    "HTTP trigger",
    "Timer trigger",
];
export const wellKnownCSharpTemplateToDisplayNames = new Map<WellKnownCSharpTemplate, WellKnownCSharpTemplateDisplayName>([
    ["Azure Blob Storage trigger", "Azure Blob Storage trigger"],
    ["Azure Cosmos DB trigger", "Azure Cosmos DB trigger"],
    ["Azure Event Grid trigger", "Azure Event Grid trigger"],
    ["Azure Event Hub Trigger", "Azure Event Hub Trigger"],
    ["Azure Queue trigger", "Azure Queue trigger"],
    ["Azure Service Bus Queue trigger", "Azure Service Bus Queue trigger"],
    ["Azure Service Bus Topic trigger", "Azure Service Bus Topic trigger"],
    ["AzureBlobStorageTrigger", "Azure Blob Storage trigger"],
    ["AzureCosmosDBTrigger", "Azure Cosmos DB trigger"],
    ["AzureEventGridTrigger", "Azure Event Grid trigger"],
    ["AzureEventHubTrigger", "Azure Event Hub Trigger"],
    ["AzureQueueTrigger", "Azure Queue trigger"],
    ["AzureServiceBusQueueTrigger", "Azure Service Bus Queue trigger"],
    ["AzureServiceBusTopicTrigger", "Azure Service Bus Topic trigger"],
    ["HTTP trigger with OpenAPI", "HTTP trigger with OpenAPI"],
    ["HTTP trigger", "HTTP trigger"],
    ["HttpTrigger", "HTTP trigger"],
    ["HttpTriggerWithOpenAPI", "HTTP trigger with OpenAPI"],
    ["Timer trigger", "Timer trigger"],
    ["TimerTrigger", "Timer trigger"],
]);
export function getWellKnownCSharpTemplate(template: string | undefined): WellKnownCSharpTemplate | undefined {
    if (template === undefined) {
        return undefined;
    }
    if (wellKnownCSharpTemplateToDisplayNames.has(template as WellKnownCSharpTemplate)) {
        return wellKnownCSharpTemplateToDisplayNames.get(template as WellKnownCSharpTemplate);
    }
    const matchingTemplate = [...wellKnownCSharpTemplateToDisplayNames.keys()].find((key) => key.toLowerCase() === template?.toLowerCase() || key.toLowerCase().includes(template?.toLowerCase() ?? ""));
    return matchingTemplate !== undefined ? wellKnownCSharpTemplateToDisplayNames.get(matchingTemplate) : undefined;
}

export type WellKnownTemplate = WellKnownTypeScriptTemplate | WellKnownCSharpTemplate;

export type WellKnownFunctionAppRuntime = "Node.js" |
    ".NET";
export function isWellKnownFunctionAppRuntime(runtime: string | undefined): runtime is WellKnownFunctionAppRuntime {
    return runtime === "Node.js" || runtime === ".NET";
}
