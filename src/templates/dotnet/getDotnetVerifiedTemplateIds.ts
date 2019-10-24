/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FuncVersion, getMajorVersion } from "../../FuncVersion";

export function getDotnetVerifiedTemplateIds(version: string): string[] {
    let verifiedTemplateIds: string[] = [
        'EventHubTrigger',
        'HttpTrigger',
        'BlobTrigger',
        'QueueTrigger',
        'TimerTrigger',
        'ServiceBusTopicTrigger',
        'ServiceBusQueueTrigger',
        'CosmosDBTrigger'
    ];

    if (version === FuncVersion.v1) {
        verifiedTemplateIds = verifiedTemplateIds.concat([
            'EventGridTrigger',
            'GenericWebHook',
            'GitHubWebHook',
            'HttpTriggerWithParameters'
        ]);
    } else {
        verifiedTemplateIds = verifiedTemplateIds.concat([
            'DurableFunctionsOrchestration'
        ]);
    }

    const majorVersion: string = getMajorVersion(version);
    return verifiedTemplateIds.map((id: string) => {
        return `Azure.Function.CSharp.${id}.${majorVersion}.x`;
    });
}
