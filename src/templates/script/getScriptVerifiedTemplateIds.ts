/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FuncVersion } from '../../FuncVersion';
import { nodeV4Suffix } from '../../utils/programmingModelUtils';

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
            'DurableFunctionsHttpStart',
            'DurableFunctionsOrchestrator',
            'EventGridTrigger',
            'EventHubTrigger',
            'ServiceBusQueueTrigger',
            'ServiceBusTopicTrigger',
            'SendGrid',
            'IoTHubTrigger',
            //TODO: Add unit test for EventGridBlobTrigger
            'EventGridBlobTrigger',
            'SqlTrigger'
        ]);

        // These languages are only supported in v2+ - same functions as JavaScript, with a few minor exceptions that aren't worth distinguishing here
        // NOTE: The Python Preview IDs are only temporary.
        // NOTE: The Node Programming Model IDs include -4.x as a suffix
        const regExps = verifiedTemplateIds.map(t => new RegExp(`^${t}-(JavaScript(${nodeV4Suffix})?|TypeScript(${nodeV4Suffix})?|Python|PowerShell|Custom|Python-Preview|Python-Preview-Append)$`, 'i'));

        // The Entity templates aren't supported in PowerShell at all, and the DurableFunctionsEntityHttpStart template is not yet supported in Python.
        // As a result, we need to manually create their respective regular expressions to account for these edge cases
        const entityRegExps = [new RegExp(`^DurableFunctionsEntity-(JavaScript(${nodeV4Suffix})?|TypeScript(${nodeV4Suffix})?|Python|Custom)$`, 'i'), new RegExp(`^DurableFunctionsEntityHttpStart-(JavaScript(${nodeV4Suffix})?|TypeScript(${nodeV4Suffix})?|Custom)$`, 'i')];
        return regExps.concat(entityRegExps);
    }
}
