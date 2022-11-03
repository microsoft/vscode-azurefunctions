/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FuncVersion } from '../../FuncVersion';

export function getScriptVerifiedTemplateIds(version: string): (string | RegExp)[] {
    let verifiedTemplateIds: string[] = [
        'BlobTrigger',
        'HttpTrigger',
        'QueueTrigger',
        'TimerTrigger'
    ];

    if (version === FuncVersion.v1) {
        verifiedTemplateIds = verifiedTemplateIds.concat([
            'GenericWebHook',
            'GitHubWebHook',
            'HttpTriggerWithParameters',
            'ManualTrigger'
        ]);
        return verifiedTemplateIds.map(t => `${t}-JavaScript`);
    } else {
        // For JavaScript, only include triggers that require extensions in v2. v1 doesn't have the same support for 'func extensions install'
        verifiedTemplateIds = verifiedTemplateIds.concat([
            'CosmosDBTrigger',
            'DurableFunctionsActivity',
            'DurableFunctionsEntity',
            'DurableFunctionsEntityHttpStart',
            'DurableFunctionsHttpStart',
            'DurableFunctionsOrchestrator',
            'EventGridTrigger',
            'EventHubTrigger',
            'ServiceBusQueueTrigger',
            'ServiceBusTopicTrigger',
            'SendGrid',
            'IoTHubTrigger',
        ]);

        // These languages are only supported in v2+ - same functions as JavaScript, with a few minor exceptions that aren't worth distinguishing here
        // NOTE: The Python Preview IDs are only temporary.
        return verifiedTemplateIds.map(t => new RegExp(`^${t}-(JavaScript|TypeScript|Python|PowerShell|Custom|Python-Preview|Python-Preview-Append)$`, 'i'));
    }
}
