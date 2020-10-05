/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FuncVersion } from '../../FuncVersion';

export function getScriptVerifiedTemplateIds(version: string): string[] {
    let verifiedTemplateIds: string[] = [
        'BlobTrigger-JavaScript',
        'HttpTrigger-JavaScript',
        'QueueTrigger-JavaScript',
        'TimerTrigger-JavaScript'
    ];

    if (version === FuncVersion.v1) {
        verifiedTemplateIds = verifiedTemplateIds.concat([
            'GenericWebHook-JavaScript',
            'GitHubWebHook-JavaScript',
            'HttpTriggerWithParameters-JavaScript',
            'ManualTrigger-JavaScript'
        ]);
    } else {
        // For JavaScript, only include triggers that require extensions in v2. v1 doesn't have the same support for 'func extensions install'
        verifiedTemplateIds = verifiedTemplateIds.concat([
            'CosmosDBTrigger-JavaScript',
            'DurableFunctionsActivity-JavaScript',
            'DurableFunctionsHttpStart-JavaScript',
            'DurableFunctionsOrchestrator-JavaScript',
            'EventGridTrigger-JavaScript',
            'EventHubTrigger-JavaScript',
            'ServiceBusQueueTrigger-JavaScript',
            'ServiceBusTopicTrigger-JavaScript',
            'SendGrid-JavaScript',
            'IoTHubTrigger-JavaScript',
        ]);

        const javaScriptTemplateIds: string[] = verifiedTemplateIds;

        // These languages are only supported in v2+ - same functions as JavaScript, with a few minor exceptions that aren't worth distinguishing here
        verifiedTemplateIds = verifiedTemplateIds.concat(javaScriptTemplateIds.map(t => t.replace('JavaScript', 'Python')));
        verifiedTemplateIds = verifiedTemplateIds.concat(javaScriptTemplateIds.map(t => t.replace('JavaScript', 'TypeScript')));
        verifiedTemplateIds = verifiedTemplateIds.concat(javaScriptTemplateIds.map(t => t.replace('JavaScript', 'PowerShell')));
        verifiedTemplateIds = verifiedTemplateIds.concat(javaScriptTemplateIds.map(t => t.replace('JavaScript', 'Custom')));
    }

    return verifiedTemplateIds;
}
