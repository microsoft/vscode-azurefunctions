/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { getDTSLocalSettingsValues, getDTSSettingsKeys } from '../../../../commands/appSettings/connectionSettings/durableTaskScheduler/getDTSLocalProjectConnections';
import { requestUtils } from '../../../../utils/requestUtils';
import { type IPreDebugValidateContext } from '../../IPreDebugValidateContext';
import { DTSEmulatorStartStep } from './DTSEmulatorStartStep';
import { type ILocalEmulatorProvider } from './LocalEmulatorProvidersStep';

export function createDTSEmulatorProvider<T extends IPreDebugValidateContext>(): ILocalEmulatorProvider<T> {
    return {
        name: 'Durable Task Scheduler',

        async getConnectionInfo(context: T) {
            const { dtsConnectionKey, dtsHubConnectionKey } = await getDTSSettingsKeys(context) ?? {};
            const { dtsConnectionValue } = await getDTSLocalSettingsValues(context, { dtsConnectionKey, dtsHubConnectionKey }) ?? {};

            if (!dtsConnectionValue) {
                return { connection: undefined, isEmulator: false };
            }

            const endpointMatch = dtsConnectionValue.match(/Endpoint=([^;]+)/);
            const isEmulator = endpointMatch ? /localhost/i.test(endpointMatch[1]) : false;

            return { connection: dtsConnectionValue, isEmulator };
        },

        async isEmulatorRunning(context: T, emulatorConnection: string) {
            return isAliveConnection(context, emulatorConnection);
        },

        provideExecuteSteps() {
            return [new DTSEmulatorStartStep()];
        },
    };
}

export async function isAliveConnection(context: IActionContext, connection: string): Promise<boolean> {
    // We need to extract the endpoint from a string like: Endpoint=http://localhost:55053/;Authentication=None
    const endpointMatch = connection.match(/Endpoint=([^;]+)/);
    if (!endpointMatch) {
        return false;
    }

    try {
        const url: string = endpointMatch[1];
        await requestUtils.sendRequestWithExtTimeout(context, { url, method: 'GET' });
        return true;
    } catch (e) {
        // Even if we get back an error, if we can read a status code, the connection provided a response and is still alive
        const statusCode = (e as { statusCode?: number })?.statusCode;
        return !!statusCode;
    }
}
