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
import { clientIdKey } from '../../../durableTaskScheduler/copySchedulerConnectionString';
import { notifyFailedToConfigureHost } from '../notifyFailedToConfigureHost';
import { setLocalSetting } from '../setConnectionSetting';
import { type IDTSAzureConnectionWizardContext, type IDTSConnectionWizardContext } from './IDTSConnectionWizardContext';

export class DTSConnectionSetSettingStep<T extends IDTSConnectionWizardContext | IDTSAzureConnectionWizardContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    public priority: number = 240;
    public stepName: string = 'dtsConnectionSetSettingStep';

    protected getOutputLogSuccess = (context: T) => localize('prepareDTSConnectionSuccess', 'Successfully prepared DTS connection: "{0}".', context.newDTSConnectionSettingValue);
    protected getOutputLogFail = (context: T) => localize('prepareDTSConnectionFail', 'Failed to prepare DTS connection: "{0}".', context.newDTSConnectionSettingValue);
    protected getTreeItemLabel = () => localize('prepareDTSConnectionLabel', 'Prepare DTS connection: "{0}"', 'Endpoint=...');

    public async execute(context: T): Promise<void> {
        if (!context.newDTSConnectionSettingKey) {
            try {
                await this.configureHostJson(context, ConnectionKey.DTS);
            } catch (e) {
                context.telemetry.properties.dtsHostConfigFailed = 'true';
                const message: string = localize('dtsHostConfigFailed', 'Unable to find and configure "{0}" in your project root. You may want to manually set your DTS connection string name to "{1}".', hostFileName, ConnectionKey.DTS);
                notifyFailedToConfigureHost(context, message);
                ext.outputChannel.appendLog(parseError(e).message);
            }

            context.newDTSConnectionSettingKey = ConnectionKey.DTS;
        }

        const newDTSConnectionSettingKey = nonNullProp(context, 'newDTSConnectionSettingKey');
        let newDTSConnectionSettingValue = nonNullProp(context, 'newDTSConnectionSettingValue');

        // Todo: Move this to `DurableTaskSchedulerGetConnectionStep` when we upgrade the azure package for new identity logic
        if ((context as IDTSAzureConnectionWizardContext).managedIdentity) {
            newDTSConnectionSettingValue = newDTSConnectionSettingValue.replace(clientIdKey, (context as IDTSAzureConnectionWizardContext).managedIdentity?.clientId ?? clientIdKey);
        }

        if (context.action === CodeAction.Debug) {
            await setLocalSetting(context, newDTSConnectionSettingKey, newDTSConnectionSettingValue);
        } else {
            // No further action required
        }

        context.newDTSConnectionSettingValue = newDTSConnectionSettingValue;
        context.valuesToMask.push(context.newDTSConnectionSettingValue);
    }

    public shouldExecute(context: T): boolean {
        return !!context.newDTSConnectionSettingValue;
    }

    private async configureHostJson(context: T, dtsConnectionKey: string): Promise<void> {
        const hostJsonPath: string = path.join(context.projectPath, hostFileName);
        const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath) as IHostJsonV2;

        hostJson.extensions ??= {};
        hostJson.extensions.durableTask ??= {};

        const dtsTask = hostJson.extensions.durableTask as IDTSTaskJson;
        dtsTask.storageProvider ??= {};
        dtsTask.storageProvider.connectionStringName = dtsConnectionKey;

        await AzExtFsExtra.writeJSON(hostJsonPath, hostJson);
    }
}
