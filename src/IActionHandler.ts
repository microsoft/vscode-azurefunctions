/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TelemetryMeasurements, TelemetryProperties } from "vscode-azureextensionui";

export interface IActionHandler {
    // tslint:disable-next-line:no-any
    callWithTelemetry(callbackId: string, callback: (properties: TelemetryProperties, measurements: TelemetryMeasurements) => any): Promise<any>;
}
