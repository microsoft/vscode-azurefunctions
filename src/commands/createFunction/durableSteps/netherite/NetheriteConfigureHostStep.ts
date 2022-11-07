/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStep, nonNullValue } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { hostFileName } from '../../../../constants';
import { IHostJsonV2, INetheriteTaskJson } from '../../../../funcConfig/host';
import { netheriteUtils } from '../../../../utils/durableUtils';
import { IEventHubsConnectionWizardContext } from '../../../appSettings/IEventHubsConnectionWizardContext';

export class NetheriteConfigureHostStep<T extends IEventHubsConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 245;

    public async execute(context: T): Promise<void> {
        const hostJsonPath: string = path.join(context.projectPath, hostFileName);
        const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath) as IHostJsonV2;

        const durableTask = hostJson.extensions?.durableTask as INetheriteTaskJson ?? {};
        const existingHubName: string | undefined = durableTask?.hubName;

        hostJson.extensions ??= {};
        hostJson.extensions.durableTask = netheriteUtils.getDefaultNetheriteTaskConfig(
            nonNullValue(context.newEventHubName || existingHubName)
        );

        await AzExtFsExtra.writeJSON(hostJsonPath, hostJson);
    }

    public shouldExecute(context: T): boolean {
        return !!context.newEventHubName;
    }
}
