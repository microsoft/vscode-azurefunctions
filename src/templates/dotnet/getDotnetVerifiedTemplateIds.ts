/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FuncVersion } from "../../FuncVersion";

export function getDotnetVerifiedTemplateIds(version: string): RegExp[] {
    let verifiedTemplateIds: string[] = [
        'EventHubTrigger',
        'HttpTrigger',
        'HttpTriggerWithOpenAPI',
        'BlobTrigger',
        'QueueTrigger',
        'TimerTrigger',
        'ServiceBusTopicTrigger',
        'ServiceBusQueueTrigger',
        'CosmosDBTrigger',
        'EventGridTrigger'
    ];

    if (version === FuncVersion.v1) {
        verifiedTemplateIds = verifiedTemplateIds.concat([
            'GenericWebHook',
            'GitHubWebHook',
            'HttpTriggerWithParameters'
        ]);
    } else {
        verifiedTemplateIds = verifiedTemplateIds.concat([
            'DurableFunctionsOrchestration',
            'IotHubTrigger'
        ]);
    }

    return verifiedTemplateIds.map(id => {
        if (id === 'CosmosDBTrigger') {
            // CosmosDBTrigger has 2.x, 3.x, and 4.x templates. Only 4.x should be considered "verified"
            return new RegExp(`^azure\\.function\\.csharp\\.(?:isolated\\.|)${id}\\.[4]+\\.x$`, 'i')
        }
        return new RegExp(`^azure\\.function\\.csharp\\.(?:isolated\\.|)${id}\\.[0-9]+\\.x$`, 'i');
    });
}
