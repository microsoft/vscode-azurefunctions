/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import {
    findPollingConnectorBindings,
    selectPollingConnectorBinding,
} from '../../connectorTrigger/connectorTriggerBindings';
import {
    type ConnectorTriggerBindingResolver,
    type ConnectorTriggerLocalBinding,
    type ConnectorTriggerProjectMetadata,
} from './connectorTriggerF5Contracts';

export class ProjectConnectorTriggerBindingResolver implements ConnectorTriggerBindingResolver {
    public async resolve(
        context: IActionContext,
        projectPath: string,
        metadata: ConnectorTriggerProjectMetadata,
    ): Promise<ConnectorTriggerLocalBinding> {
        const binding = selectPollingConnectorBinding(
            await findPollingConnectorBindings(projectPath),
            metadata.operationId,
        );
        maskValue(context, binding.connectionSettingName);
        maskValue(context, binding.triggerConfigSettingName);
        return binding;
    }
}

function maskValue(context: IActionContext, value: string): void {
    if (!context.valuesToMask.includes(value)) {
        context.valuesToMask.push(value);
    }
}
