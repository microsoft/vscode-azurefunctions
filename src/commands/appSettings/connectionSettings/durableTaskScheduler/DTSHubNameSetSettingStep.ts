/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStepWithActivityOutput, nonNullProp, parseError } from '@microsoft/vscode-azext-utils';
import * as path from "path";
import { CodeAction, ConnectionKey, hostFileName } from '../../../../constants';
import { ext } from '../../../../extensionVariables';
import { type IDTSTaskJson, type IHostJsonV2 } from '../../../../funcConfig/host';
import { localize } from '../../../../localize';
import { tryGetVariableSubstitutedKey } from '../getVariableSubstitutedKey';
import { notifyFailedToConfigureHost } from '../notifyFailedToConfigureHost';
import { setLocalSetting } from '../setConnectionSetting';
import { type IDTSConnectionWizardContext } from './IDTSConnectionWizardContext';

export class DTSHubNameSetSettingStep<T extends IDTSConnectionWizardContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    public priority: number = 241;
    public stepName: string = 'dtsHubNameSetSettingStep';

    protected getOutputLogSuccess = (context: T) => localize('prepareDTSHubNameSuccess', 'Successfully prepared DTS hub connection: "{0}".', context.newDTSHubConnectionSettingValue);
    protected getOutputLogFail = (context: T) => localize('prepareDTSHubNameFail', 'Failed to prepare DTS hub connection: "{0}".', context.newDTSHubConnectionSettingValue);
    protected getTreeItemLabel = (context: T) => localize('prepareDTSHubNameLabel', 'Prepare DTS hub connection: "{0}"', context.newDTSHubConnectionSettingValue);

    public async execute(context: T): Promise<void> {
        if (!context.newDTSHubConnectionSettingKey) {
            try {
                await this.configureHostJson(context, ConnectionKey.DTSHub);
            } catch (e) {
                context.telemetry.properties.dtsHostConfigFailed = 'true';
                const message: string = localize('dtsHostHubConfigFailed', 'Unable to find and configure "{0}" in your project root. You may want to manually set your DTS hub name to "{1}".', hostFileName, ConnectionKey.DTSHub);
                notifyFailedToConfigureHost(context, message);
                ext.outputChannel.appendLog(parseError(e).message);
            }

            context.newDTSHubConnectionSettingKey = tryGetVariableSubstitutedKey(ConnectionKey.DTSHub);
        }

        if (context.action === CodeAction.Debug) {
            await setLocalSetting(
                context,
                nonNullProp(context, 'newDTSHubConnectionSettingKey'),
                nonNullProp(context, 'newDTSHubConnectionSettingValue'),
            );
        } else {
            // No further action required
        }
    }

    public shouldExecute(context: T): boolean {
        return !!context.newDTSHubConnectionSettingValue;
    }

    private async configureHostJson(context: T, hubName: string): Promise<void> {
        const hostJsonPath: string = path.join(context.projectPath, hostFileName);
        const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath) as IHostJsonV2;

        hostJson.extensions ??= {};
        hostJson.extensions.durableTask ??= {};
        (hostJson.extensions.durableTask as IDTSTaskJson).hubName = hubName;

        await AzExtFsExtra.writeJSON(hostJsonPath, hostJson);
    }
}
