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
        'EventGridTrigger',
        'EventGridCloudEventTrigger',
        //TODO: Add unit test for EventGridBlobTrigger
        'EventGridBlobTrigger,'
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
        return new RegExp(`^azure\\.function\\.csharp\\.(?:isolated\\.|)${id}\\.(?:Net(Core|Fx)\.|)[0-9]+\\.x$`, 'i');
    });
}
