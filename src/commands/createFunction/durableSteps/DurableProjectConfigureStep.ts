/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStepWithActivityOutput } from '@microsoft/vscode-azext-utils';
import * as path from "path";
import { type Progress } from 'vscode';
import { ConnectionKey, DurableBackend, hostFileName, ProjectLanguage } from '../../../constants';
import { viewOutput } from '../../../constants-nls';
import { ext } from '../../../extensionVariables';
import { type IHostJsonV2 } from '../../../funcConfig/host';
import { MismatchBehavior, setLocalAppSetting } from '../../../funcConfig/local.settings';
import { localize } from '../../../localize';
import { durableUtils } from '../../../utils/durableUtils';
import { type IFunctionWizardContext } from '../IFunctionWizardContext';

export class DurableProjectConfigureStep<T extends IFunctionWizardContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    protected getTreeItemLabel(_context: T): string {
        return localize('configuringDurableProject', 'Configure durable project settings');
    }
    protected getOutputLogSuccess(_context: T): string {
        return localize('configuredDurableProject', 'Successfully configured durable project settings.');
    }
    protected getOutputLogFail(_context: T): string {
        return localize('failedToConfigureDurableProject', 'Failed to configure durable project settings.');
    }
    protected getOutputLogProgress(_context: T): string {
        return localize('configuringDurableProject', 'Configuring durable project settings...');
    }
    protected preDeployTask: string = 'funcHostStart';
    public stepName: string = 'DurableProjectConfigureStep';
    public priority: number = 225;

    public async execute(context: T, _progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
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
                hostJson.extensions.durableTask = durableUtils.getDefaultNetheriteTaskConfig();
                await setLocalAppSetting(context, context.projectPath, ConnectionKey.EventHubs, '', MismatchBehavior.Overwrite);
                break;
            case DurableBackend.DTS:
                hostJson.extensions.durableTask = durableUtils.getDefaultDTSTaskConfig();
                // Non- .NET projects require a special preview extension bundle to work properly
                // Todo: Remove once this functionality is out of preview
                if (context.language !== ProjectLanguage.CSharp && context.language !== ProjectLanguage.FSharp) {
                    hostJson.extensionBundle = {
                        id: 'Microsoft.Azure.Functions.ExtensionBundle.Preview',
                        version: '[4.29.0, 5.0.0)',
                    };
                }
                await setLocalAppSetting(context, context.projectPath, ConnectionKey.DTS, '', MismatchBehavior.Overwrite);
                await setLocalAppSetting(context, context.projectPath, ConnectionKey.DTSHub, 'default', MismatchBehavior.Overwrite);
                break;
            case DurableBackend.SQL:
                hostJson.extensions.durableTask = durableUtils.getDefaultSqlTaskConfig();
                await setLocalAppSetting(context, context.projectPath, ConnectionKey.SQL, '', MismatchBehavior.Overwrite);
                break;
            default:
        }

        await AzExtFsExtra.writeJSON(hostJsonPath, hostJson);
    }
}
