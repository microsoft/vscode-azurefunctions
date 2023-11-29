/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, type IActionContext } from "@microsoft/vscode-azext-utils";
import type * as api from '../../vscode-azurefunctions.api';
import { createFunctionInternal } from "../createFunction/createFunction";

export async function createFunctionFromApi(options: api.ICreateFunctionOptions): Promise<void> {
    return await callWithTelemetryAndErrorHandling('api.createFunction', async (context: IActionContext) => {
        await createFunctionInternal(context, options);
    });
}
