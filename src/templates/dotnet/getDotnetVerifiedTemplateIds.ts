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

    let ids: string[] = convertToFullIds(verifiedTemplateIds, version);
    if (version === FuncVersion.v3) {
        // Also include v2 ids since v3 templates still use '2' in the id and it's not clear if/when that'll change
        // https://github.com/microsoft/vscode-azurefunctions/issues/1602
        ids = ids.concat(convertToFullIds(verifiedTemplateIds, FuncVersion.v2));

        // And include Isolated templates
        ids = ids.concat(convertToFullIds(verifiedTemplateIds, version, true));
    }
    return ids;
}

function convertToFullIds(ids: string[], version: string, isIsolated: boolean = false): string[] {
    const majorVersion: string = getMajorVersion(version);
    return ids.map(id => {
        let fullId = `Azure.Function.CSharp.`;
        if (isIsolated) {
            fullId += 'Isolated.';
        }
        fullId += `${id}.${majorVersion}.x`;
        return fullId;
    });
}
