/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FuncVersion } from "../../FuncVersion";

export function getDotnetVerifiedTemplateIds(version: string): RegExp[] {
    /**
     * IMPORTANT: These values must match the .NET template *Identity* segment used by `dotnet new`.
     * Do NOT use user-facing display names (they often contain spaces/parentheses and won't match Identity).
     */
    let verifiedTemplateIds: string[] = [
        // Core triggers
        'BlobTrigger',
        'CosmosDBTrigger',
        'DurableFunctionsOrchestration',
        'EventGridTrigger',
        'EventGridCloudEventTrigger',
        'EventHubTrigger',
        'HttpTrigger',
        'HttpTriggerWithOpenAPI',
        'QueueTrigger',
        'ServiceBusQueueTrigger',
        'ServiceBusTopicTrigger',
        'TimerTrigger',

        // Variants
        'EventGridBlobTrigger',

        // SQL templates vary by worker model
        'SqlInputBinding',
        'SqlInputBindingIsolated',
        'SqlOutputBinding',
        'SqlOutputBindingIsolated'
    ];

    if (version === FuncVersion.v1) {
        verifiedTemplateIds = verifiedTemplateIds.concat([
            'GenericWebHook',
            'GitHubWebHook',
            'HttpTriggerWithParameters'
        ]);
    } else {
        verifiedTemplateIds = verifiedTemplateIds.concat([
            'IotHubTrigger'
        ]);
    }

    return verifiedTemplateIds.map(id => {
        // Identity examples:
        // - Azure.Function.CSharp.HttpTrigger.2.x
        // - Azure.Function.CSharp.Isolated.HttpTrigger.Net8.0
        // Keep this intentionally permissive after the template short-name.
        const escapedId: string = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`^azure\\.function\\.(?:c|f)sharp\\.(?:isolated\\.)?${escapedId}(?:\\..*)?$`, 'i');
    });
}

