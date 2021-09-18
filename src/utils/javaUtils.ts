/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HttpOperationResponse } from "@azure/ms-rest-js";
import { IActionContext } from "vscode-azureextensionui";
import { nonNullProp } from "./nonNull";
import { requestUtils } from "./requestUtils";

export namespace javaUtils {
    const cachedVersions: Map<string, string> = new Map<string, string>();

    export async function getLatestArtifactVersionFromMetaData(context: IActionContext, metaDataUrl: string): Promise<string | undefined> {
        if (!cachedVersions.has(metaDataUrl)) {
            const response: HttpOperationResponse = await requestUtils.sendRequestWithExtTimeout(context, { method: 'GET', url: metaDataUrl });
            const metadate: string = nonNullProp(response, 'bodyAsText');
            const match: RegExpMatchArray | null = metadate.match(/<release>(.*)<\/release>/i);
            if (match) {
                cachedVersions.set(metaDataUrl, match[1].trim());
            }
        }
        return cachedVersions.get(metaDataUrl);
    }
}
