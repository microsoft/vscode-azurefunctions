/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStep, nonNullProp } from '@microsoft/vscode-azext-utils';
import * as path from "path";
import { hostFileName } from '../../../../constants';
import { viewOutput } from '../../../../constants-nls';
import { ext } from '../../../../extensionVariables';
import { type IHostJsonV2, type INetheriteTaskJson } from '../../../../funcConfig/host';
import { localize } from '../../../../localize';
import { setConnectionSetting } from '../setConnectionSetting';
import { type INetheriteConnectionWizardContext } from './INetheriteConnectionWizardContext';

export class EventHubSetSettingStep<T extends INetheriteConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 245;

    public async execute(context: T): Promise<void> {
        const hubName: string = nonNullProp(context, 'newEventHubConnectionSettingValue');

        if (!context.newEventHubConnectionSettingKey) {
            // Target `host.json`
            await this.configureHostJson(context, hubName);
        } else {
            // Target local or app settings
            await setConnectionSetting(
                context,
                context.newEventHubConnectionSettingKey,
                hubName,
            );
        }

        context.valuesToMask.push(context.newEventHubConnectionSettingValue as string);
    }

    public shouldExecute(context: T): boolean {
        return !!context.newEventHubConnectionSettingValue;
    }

    private async configureHostJson(context: T, hubName: string) {
        const hostJsonPath: string = path.join(context.projectPath, hostFileName);

        if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
            context.telemetry.properties.netheriteHostConfigFailed = 'true';

            const message: string = localize('netheriteHostConfigFailed', 'Unable to find and configure "{0}" in your project root. You may need to configure your Netherite event hub settings manually.', hostFileName);
            ext.outputChannel.appendLog(message);

            const notification: string = localize('failedToConfigureHost', 'Failed to configure your "{0}".', hostFileName);
            void context.ui.showWarningMessage(notification, { title: viewOutput }).then(result => {
                if (result.title === viewOutput) {
                    ext.outputChannel.show();
                }
            });

            return;
        }

        const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath) as IHostJsonV2;
        hostJson.extensions ??= {};
        hostJson.extensions.durableTask ??= {};
        (hostJson.extensions.durableTask as INetheriteTaskJson).hubName = hubName;

        await AzExtFsExtra.writeJSON(hostJsonPath, hostJson);
    }
}
