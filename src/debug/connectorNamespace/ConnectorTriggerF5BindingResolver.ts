/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { findPollingConnectorBindings } from '../../connectorTrigger/connectorTriggerBindings';
import { localize } from '../../localize';
import {
    type ConnectorTriggerBindingResolver,
    type ConnectorTriggerLocalBinding,
    type ConnectorTriggerProjectMetadata,
} from './connectorTriggerF5Contracts';

export class ProjectConnectorTriggerBindingResolver implements ConnectorTriggerBindingResolver {
    public async find(context: IActionContext, projectPath: string): Promise<ConnectorTriggerLocalBinding[]> {
        const bindings = await findPollingConnectorBindings(projectPath);
        for (const binding of bindings) {
            maskValue(context, binding.connectionSettingName);
            maskValue(context, binding.triggerConfigSettingName);
        }
        return bindings;
    }

    public async resolve(
        context: IActionContext,
        projectPath: string,
        _metadata: ConnectorTriggerProjectMetadata,
    ): Promise<ConnectorTriggerLocalBinding> {
        const bindings = await this.find(context, projectPath);
        if (bindings.length !== 1) {
            throw new Error(localize(
                'connectorSingleBindingRequired',
                'Automatic Connector Trigger setup requires exactly one polling event. Configure each event using its binding-specific local settings before retrying F5.',
            ));
        }
        return bindings[0];
    }
}

function maskValue(context: IActionContext, value: string): void {
    if (!context.valuesToMask.includes(value)) {
        context.valuesToMask.push(value);
    }
}
