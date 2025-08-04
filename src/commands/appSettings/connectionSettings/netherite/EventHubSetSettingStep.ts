/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStep, nonNullProp, parseError } from '@microsoft/vscode-azext-utils';
import * as path from "path";
import { CodeAction, hostFileName } from '../../../../constants';
import { ext } from '../../../../extensionVariables';
import { type IHostJsonV2, type INetheriteTaskJson } from '../../../../funcConfig/host';
import { localize } from '../../../../localize';
import { notifyFailedToConfigureHost } from '../notifyFailedToConfigureHost';
import { setLocalSetting } from '../setConnectionSetting';
import { type INetheriteConnectionWizardContext } from './INetheriteConnectionWizardContext';

export class EventHubSetSettingStep<T extends INetheriteConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 245;

    public async execute(context: T): Promise<void> {
        const hubName: string = nonNullProp(context, 'newEventHubConnectionSettingValue');

        if (!context.newEventHubConnectionSettingKey) {
            try {
                // First iteration of this support didn't include variable substitution, so we won't try to automatically set their local settings here
                await this.configureHostJson(context, hubName);
            } catch (e) {
                context.telemetry.properties.netheriteHostConfigFailed = 'true';
                const message: string = localize('netheriteHostHubConfigFailed', 'Unable to find and configure "{0}" in your project root. You may need to configure your event hub name to "{1}".', hostFileName, hubName);
                notifyFailedToConfigureHost(context, message);
                ext.outputChannel.appendLog(parseError(e).message);
            }
        } else {
            if (context.action === CodeAction.Debug) {
                await setLocalSetting(
                    context,
                    context.newEventHubConnectionSettingKey,
                    hubName,
                );
            } else {
                // No further action required
            }
        }

        context.valuesToMask.push(context.newEventHubConnectionSettingValue as string);
    }

    public shouldExecute(context: T): boolean {
        return !!context.newEventHubConnectionSettingValue;
    }

    private async configureHostJson(context: T, hubName: string) {
        const hostJsonPath: string = path.join(context.projectPath, hostFileName);
        const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath) as IHostJsonV2;

        hostJson.extensions ??= {};
        hostJson.extensions.durableTask ??= {};
        (hostJson.extensions.durableTask as INetheriteTaskJson).hubName = hubName;

        await AzExtFsExtra.writeJSON(hostJsonPath, hostJson);
    }
}
