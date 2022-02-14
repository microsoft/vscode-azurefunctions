/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';

export namespace telemetryUtils {
    export async function runWithDurationTelemetry<T>(context: IActionContext, prefix: string, callback: () => Promise<T>): Promise<T> {
        const start = Date.now();
        try {
            return await callback();
        } finally {
            const end = Date.now();
            const durationKey = prefix + 'Duration';
            const countKey = prefix + 'Count';
            const duration = (end - start) / 1000;

            context.telemetry.measurements[durationKey] = duration + (context.telemetry.measurements[durationKey] || 0);
            context.telemetry.measurements[countKey] = 1 + (context.telemetry.measurements[countKey] || 0);
        }
    }
}
