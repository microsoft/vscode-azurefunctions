/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStepWithActivityOutput, nonNullProp } from '@microsoft/vscode-azext-utils';
import * as path from "path";
import { hostFileName } from '../../../../constants';
import { type IDTSTaskJson, type IHostJsonV2 } from '../../../../funcConfig/host';
import { localize } from '../../../../localize';
import { notifyFailedToConfigureHost } from '../notifyFailedToConfigureHost';
import { setConnectionSetting } from '../setConnectionSetting';
import { type IDTSAzureConnectionWizardContext, type IDTSConnectionWizardContext } from './IDTSConnectionWizardContext';

export class DTSConnectionSetSettingStep<T extends IDTSConnectionWizardContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    public priority: number = 240;
    public stepName: string = 'dtsConnectionSetSettingStep';

    protected getOutputLogSuccess = (context: T) => localize('prepareDTSConnectionSuccess', 'Successfully prepared DTS connection: "{0}".', context.newDTSConnectionSettingValue);
    protected getOutputLogFail = (context: T) => localize('prepareDTSConnectionFail', 'Failed to prepare DTS connection: "{0}".', context.newDTSConnectionSettingValue);
    protected getTreeItemLabel = () => localize('prepareDTSConnectionLabel', 'Prepare DTS connection: "{0}"', 'Endpoint=...');

    public async execute(context: T): Promise<void> {
        if (!context.newDTSConnectionSettingKey) {
            const defaultDTSConnectionKey: string = 'DURABLE_TASK_SCHEDULER_CONNECTION_STRING';
            await this.configureHostJson(context, defaultDTSConnectionKey);
            context.newDTSConnectionSettingKey = defaultDTSConnectionKey;
        }

        const newDTSConnectionSettingKey = nonNullProp(context, 'newDTSConnectionSettingKey');
        let newDTSConnectionSettingValue = nonNullProp(context, 'newDTSConnectionSettingValue');

        if ((context as unknown as IDTSAzureConnectionWizardContext).managedIdentity) {
            newDTSConnectionSettingValue = newDTSConnectionSettingValue.replace('<ClientID>', (context as unknown as IDTSAzureConnectionWizardContext).managedIdentity?.clientId ?? '');
        }

        await setConnectionSetting(context, newDTSConnectionSettingKey, newDTSConnectionSettingValue);

        context.newDTSConnectionSettingValue = newDTSConnectionSettingValue;
        context.valuesToMask.push(context.newDTSConnectionSettingValue);
    }

    public shouldExecute(context: T): boolean {
        return !!context.newDTSConnectionSettingValue;
    }

    private async configureHostJson(context: T, dtsConnectionKey: string): Promise<void> {
        const hostJsonPath: string = path.join(context.projectPath, hostFileName);

        if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
            context.telemetry.properties.dtsHostConfigFailed = 'true';
            const message: string = localize('dtsConnectionConfigFailed', 'Unable to find and configure "{0}" in your project root. You may need to configure your DTS connection settings manually.', hostFileName);
            notifyFailedToConfigureHost(context, message);
            return;
        }

        const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath) as IHostJsonV2;
        hostJson.extensions ??= {};
        hostJson.extensions.durableTask ??= {};

        const dtsTask = hostJson.extensions.durableTask as IDTSTaskJson;
        dtsTask.storageProvider ??= {};
        dtsTask.storageProvider.connectionStringName = dtsConnectionKey;

        await AzExtFsExtra.writeJSON(hostJsonPath, hostJson);
    }
}
