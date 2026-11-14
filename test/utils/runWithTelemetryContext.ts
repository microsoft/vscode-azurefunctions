/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, type IActionContext } from '@microsoft/vscode-azext-utils';

export async function runWithTelemetryContext(context: IActionContext, callback: () => Promise<void>): Promise<void> {
    await callWithTelemetryAndErrorHandling('workflowTelemetryTest', async actionContext => {
        const properties = { ...actionContext.telemetry.properties, ...context.telemetry.properties };
        Object.assign(actionContext, context);
        Object.assign(actionContext.telemetry.properties, properties);
        actionContext.errorHandling.rethrow = true;
        actionContext.errorHandling.suppressDisplay = true;
        await callback();
    });
}
