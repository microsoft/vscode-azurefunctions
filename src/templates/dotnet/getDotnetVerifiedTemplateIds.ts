/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectRuntime } from '../../constants';
import { localize } from '../../localize';

export function getDotnetVerifiedTemplateIds(runtime: string): string[] {
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

    if (runtime === ProjectRuntime.v1) {
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

    return verifiedTemplateIds.map((id: string) => {
        id = `Azure.Function.CSharp.${id}`;
        switch (runtime) {
            case ProjectRuntime.v1:
                return `${id}.1.x`;
            case ProjectRuntime.v2:
                return `${id}.2.x`;
            default:
                throw new RangeError(localize('invalidRuntime', 'Invalid runtime "{0}".', runtime));
        }
    });
}
