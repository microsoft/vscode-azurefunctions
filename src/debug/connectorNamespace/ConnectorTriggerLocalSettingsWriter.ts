/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { localSettingsFileName } from '../../constants';
import { getLocalSettingsJson } from '../../funcConfig/local.settings';
import { type ConnectorTriggerLocalSettingsWriter } from './connectorTriggerF5Contracts';

export class FileConnectorTriggerLocalSettingsWriter implements ConnectorTriggerLocalSettingsWriter {
    public async write(
        context: IActionContext,
        projectPath: string,
        values: Readonly<Record<string, string>>,
    ): Promise<void> {
        const localSettingsPath = path.join(projectPath, localSettingsFileName);
        const settings = await getLocalSettingsJson(context, localSettingsPath);
        settings.Values = settings.Values || {};

        let changed = false;
        for (const [key, value] of Object.entries(values)) {
            maskValue(context, key);
            maskValue(context, value);
            if (settings.Values[key] !== value) {
                settings.Values[key] = value;
                changed = true;
            }
        }

        if (changed) {
            await AzExtFsExtra.writeJSON(localSettingsPath, settings);
        }
    }
}

function maskValue(context: IActionContext, value: string): void {
    if (value && !context.valuesToMask.includes(value)) {
        context.valuesToMask.push(value);
    }
}
