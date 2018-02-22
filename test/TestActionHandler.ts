/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TelemetryMeasurements, TelemetryProperties } from "vscode-azureextensionui";
import { IActionHandler } from "../src/IActionHandler";

export class TestActionHandler implements IActionHandler {
    // tslint:disable-next-line:no-any
    public async callWithTelemetry(_callbackId: string, callback: (properties: TelemetryProperties, measurements: TelemetryMeasurements) => any): Promise<any> {
        // tslint:disable-next-line:no-unsafe-any
        return await callback({}, {});
    }
}
