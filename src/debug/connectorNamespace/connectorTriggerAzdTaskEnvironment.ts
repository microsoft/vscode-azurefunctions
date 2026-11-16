/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { localSettingsFileName } from '../../constants';
import { getLocalSettingsJson } from '../../funcConfig/local.settings';
import { ProjectConnectorTriggerBindingResolver } from './ConnectorTriggerF5BindingResolver';
import {
    disposeConnectorAzdAuthServer,
    getConnectorAzdAuthProjectPath,
    getConnectorAzdAuthTaskEnvironment,
} from './connectorTriggerAzdAuthServer';
import { usesConnectorVscodeCredential } from './connectorTriggerVscodeCredential';

export async function getCurrentConnectorAzdAuthTaskEnvironment(
    context: IActionContext,
    location: { projectPath?: string; folderPath: string },
    environment: Readonly<Record<string, string>>,
): Promise<Record<string, string> | undefined> {
    const projectPath = getConnectorAzdAuthProjectPath(location);
    if (!projectPath) {
        return undefined;
    }
    const bindings = await new ProjectConnectorTriggerBindingResolver().find(context, projectPath);
    if (bindings.length === 0) {
        disposeConnectorAzdAuthServer(projectPath);
        return undefined;
    }
    const settings = await getLocalSettingsJson(context, path.join(projectPath, localSettingsFileName));
    if (!bindings.some(binding => usesConnectorVscodeCredential(binding.connectionSettingName, settings, environment))) {
        return undefined;
    }
    return getConnectorAzdAuthTaskEnvironment({ projectPath, folderPath: location.folderPath }, environment);
}
