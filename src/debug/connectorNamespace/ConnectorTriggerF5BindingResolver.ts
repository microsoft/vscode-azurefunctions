/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { findPollingConnectorBindings } from '../../connectorTrigger/connectorTriggerBindings';
import { addValuesToMask } from '../../connectorTrigger/connectorTriggerUtils';
import {
    type ConnectorTriggerBindingResolver,
    type ConnectorTriggerLocalBinding,
} from './connectorTriggerF5Contracts';

export class ProjectConnectorTriggerBindingResolver implements ConnectorTriggerBindingResolver {
    public async find(context: IActionContext, projectPath: string): Promise<ConnectorTriggerLocalBinding[]> {
        const bindings = await findPollingConnectorBindings(projectPath);
        for (const binding of bindings) {
            addValuesToMask(context, binding.connectionSettingName, binding.triggerConfigSettingName);
        }
        return bindings;
    }
}
