/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import * as path from "path";
import { Progress } from 'vscode';
import { ConnectionKey, DurableBackend, hostFileName } from '../../../constants';
import { viewOutput } from '../../../constants-nls';
import { ext } from '../../../extensionVariables';
import { IHostJsonV2 } from '../../../funcConfig/host';
import { MismatchBehavior, setLocalAppSetting } from '../../../funcConfig/local.settings';
import { localize } from '../../../localize';
import { durableUtils, netheriteUtils, sqlUtils } from '../../../utils/durableUtils';
import { IFunctionWizardContext } from '../IFunctionWizardContext';

export class DurableProjectConfigureStep<T extends IFunctionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 225;

    public async execute(context: T, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const configuring: string = localize('configuringDurableProject', 'Configuring durable project settings...');
        progress.report({ message: configuring });

        await this.configureHostAndLocalSettingsJson(context);
        await durableUtils.tryInstallDurableDependencies(context);
    }

    public shouldExecute(context: T): boolean {
        return !!context.newDurableStorageType;
    }

    private async configureHostAndLocalSettingsJson(context: T): Promise<void> {
        const hostJsonPath: string = path.join(context.projectPath, hostFileName);

        if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
            context.telemetry.properties.durableHostConfigFailed = 'true';

            const message: string = localize('durableHostConfigFailed', 'Unable to find and configure "{0}" in your project root. You may need to configure your durable function settings manually.', hostFileName);
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

        switch (context.newDurableStorageType) {
            case DurableBackend.Storage:
                hostJson.extensions.durableTask = durableUtils.getDefaultStorageTaskConfig();
                // Omit setting azureWebJobsStorage since it should already be initialized during 'createNewProject'
                break;
            case DurableBackend.Netherite:
                hostJson.extensions.durableTask = netheriteUtils.getDefaultNetheriteTaskConfig();
                await setLocalAppSetting(context, context.projectPath, ConnectionKey.EventHubs, '', MismatchBehavior.Overwrite);
                break;
            case DurableBackend.SQL:
                hostJson.extensions.durableTask = sqlUtils.getDefaultSqlTaskConfig();
                await setLocalAppSetting(context, context.projectPath, ConnectionKey.SQL, '', MismatchBehavior.Overwrite);
                break;
            default:
        }

        await AzExtFsExtra.writeJSON(hostJsonPath, hostJson);
    }
}
