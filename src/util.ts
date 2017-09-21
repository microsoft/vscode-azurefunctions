/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reporter } from './telemetry';

export function sendTelemetry(eventName: string, properties?: { [key: string]: string; }, measures?: { [key: string]: number; }) {
    if (reporter) {
        reporter.sendTelemetryEvent(eventName, properties, measures);
    }
}

export function errorToString(error: any): string | undefined {
    if (error) {
        if (error instanceof Error) {
            return JSON.stringify({
                'Error': error.constructor.name,
                'Message': error.message
            });
        }

        if (typeof (error) === 'object') {
            return JSON.stringify({
                'object': error.constructor.name
            });
        }

        return error.toString();
    }
}