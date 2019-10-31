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

    let ids: string[] = convertToFullIds(verifiedTemplateIds, version);
    if (version === FuncVersion.v3) {
        // Also include v2 ids since v3 templates still use '2' in the id and it's not clear if/when that'll change
        // https://github.com/microsoft/vscode-azurefunctions/issues/1602
        ids = ids.concat(convertToFullIds(verifiedTemplateIds, FuncVersion.v2));
    }
    return ids;
}

function convertToFullIds(ids: string[], version: string): string[] {
    const majorVersion: string = getMajorVersion(version);
    return ids.map((id: string) => {
        return `Azure.Function.CSharp.${id}.${majorVersion}.x`;
    });
}
