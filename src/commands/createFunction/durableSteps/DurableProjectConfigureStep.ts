/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStepWithActivityOutput, nonNullValue, parseError, type IParsedError } from '@microsoft/vscode-azext-utils';
import * as path from "path";
import { type Progress } from 'vscode';
import { ConnectionKey, DurableBackend, hostFileName, ProjectLanguage } from '../../../constants';
import { viewOutput } from '../../../constants-nls';
import { ext } from '../../../extensionVariables';
import { type IDTSTaskJson, type IHostJsonV2, type INetheriteTaskJson, type ISqlTaskJson, type IStorageTaskJson } from '../../../funcConfig/host';
import { MismatchBehavior, setLocalAppSetting } from '../../../funcConfig/local.settings';
import { localize } from '../../../localize';
import { cpUtils } from '../../../utils/cpUtils';
import { durableUtils } from '../../../utils/durableUtils';
import { pythonUtils } from '../../../utils/pythonUtils';
import { venvUtils } from '../../../utils/venvUtils';
import { tryGetVariableSubstitutedKey } from '../../appSettings/connectionSettings/getVariableSubstitutedKey';
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
    protected preDeployTask: string = 'funcHostStart';
    public stepName: string = 'DurableProjectConfigureStep';
    public priority: number = 225;

    public async execute(context: T, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        progress.report({ message: localize('configuringDurableProject', 'Configuring durable project settings...') });
        await this.configureHostAndLocalSettingsJson(context);
        await this.tryInstallDurableDependencies(context);
    }

    public shouldExecute(context: T): boolean {
        return !!context.newDurableStorageType;
    }

    // #region Durable Task Local Settings

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
                hostJson.extensions.durableTask = this.getDefaultStorageTaskConfig();
                // Omit setting azureWebJobsStorage since it should already be initialized during 'createNewProject'
                break;
            case DurableBackend.Netherite:
                hostJson.extensions.durableTask = this.getDefaultNetheriteTaskConfig();
                await setLocalAppSetting(context, context.projectPath, ConnectionKey.EventHubs, '', MismatchBehavior.Overwrite);
                break;
            case DurableBackend.DTS:
                hostJson.extensions.durableTask = this.getDefaultDTSTaskConfig();
                // Non- .NET projects require a special preview extension bundle to work properly
                // Todo: Remove once this functionality is out of preview
                if (context.language !== ProjectLanguage.CSharp && context.language !== ProjectLanguage.FSharp) {
                    hostJson.extensionBundle = {
                        id: 'Microsoft.Azure.Functions.ExtensionBundle.Preview',
                        version: '[4.29.0, 5.0.0)',
                    };
                    ext.outputChannel.appendLog(localize('extensionBundlePreview', 'Updated "host.json" extension bundle to preview version to enable new DTS features.'));
                }
                await setLocalAppSetting(context, context.projectPath, ConnectionKey.DTS, '', MismatchBehavior.Overwrite);
                await setLocalAppSetting(context, context.projectPath, nonNullValue(tryGetVariableSubstitutedKey(ConnectionKey.DTSHub)), '', MismatchBehavior.Overwrite);
                break;
            case DurableBackend.SQL:
                hostJson.extensions.durableTask = this.getDefaultSqlTaskConfig();
                await setLocalAppSetting(context, context.projectPath, ConnectionKey.SQL, '', MismatchBehavior.Overwrite);
                break;
            default:
        }

        await AzExtFsExtra.writeJSON(hostJsonPath, hostJson);
    }

    private getDefaultStorageTaskConfig(): IStorageTaskJson {
        return {
            storageProvider: {
                type: DurableBackend.Storage,
            }
        };
    }

    private getDefaultNetheriteTaskConfig(): INetheriteTaskJson {
        return {
            hubName: '',
            useGracefulShutdown: true,
            storageProvider: {
                type: DurableBackend.Netherite,
                StorageConnectionName: ConnectionKey.Storage,
                EventHubsConnectionName: ConnectionKey.EventHubs,
            }
        };
    }

    private getDefaultDTSTaskConfig(): IDTSTaskJson {
        return {
            hubName: '%TASKHUB_NAME%',
            storageProvider: {
                type: DurableBackend.DTS,
                connectionStringName: ConnectionKey.DTS,
            }
        };
    }

    private getDefaultSqlTaskConfig(): ISqlTaskJson {
        return {
            storageProvider: {
                type: DurableBackend.SQL,
                connectionStringName: ConnectionKey.SQL,
                taskEventLockTimeout: "00:02:00",
                createDatabaseIfNotExists: true,
            }
        };
    }

    // #endregion Durable Task Local Settings

    // #region Install Durable Dependencies

    private async tryInstallDurableDependencies(context: IFunctionWizardContext): Promise<void> {
        switch (context.language) {
            case ProjectLanguage.Java:
                // Todo: Revisit when adding Java implementation
                break;
            case ProjectLanguage.CSharp:
            case ProjectLanguage.FSharp:
                await this.installDotnetDependencies(context);
                break;
            case ProjectLanguage.JavaScript:
            case ProjectLanguage.TypeScript:
                await this.installNodeDependencies(context);
                break;
            case ProjectLanguage.Python:
                await pythonUtils.addDependencyToRequirements(durableUtils.pythonDfPackage, context.projectPath);
                await venvUtils.runPipInstallCommandIfPossible(context.projectPath);
                break;
            case ProjectLanguage.PowerShell:
                // Todo: Revisit when adding PowerShell implementation
                break;
            default:
        }
    }

    private async installDotnetDependencies(context: IFunctionWizardContext): Promise<void> {
        const packages: { name: string; prerelease?: boolean }[] = [];
        const isDotnetIsolated: boolean = /Isolated/i.test(context.functionTemplate?.id ?? '');

        switch (context.newDurableStorageType) {
            case DurableBackend.Netherite:
                isDotnetIsolated ?
                    packages.push({ name: durableUtils.dotnetIsolatedDfNetheritePackage }) :
                    packages.push({ name: durableUtils.dotnetInProcDfNetheritePackage });
                break;
            case DurableBackend.DTS:
                // Todo: Remove prerelease flag once this functionality is out of preview
                isDotnetIsolated ?
                    packages.push({ name: durableUtils.dotnetIsolatedDTSPackage, prerelease: true }) :
                    packages.push({ name: durableUtils.dotnetInProcDTSPackage, prerelease: true });
                break;
            case DurableBackend.SQL:
                isDotnetIsolated ?
                    packages.push({ name: durableUtils.dotnetIsolatedDfSqlPackage }) :
                    packages.push({ name: durableUtils.dotnetInProcDfSqlPackage });
                break;
            case DurableBackend.Storage:
            default:
        }

        // Although the templates should incorporate this package already, it is often included with an out-dated version
        // which can lead to errors on first run.  To improve this experience for our users, ensure that the latest version is used.
        if (!isDotnetIsolated) {
            packages.push({ name: durableUtils.dotnetInProcDfBasePackage });
        }

        const failedPackages: string[] = [];
        for (const p of packages) {
            try {
                const packageArgs: string[] = [p.name];
                if (p.prerelease) {
                    packageArgs.push('--prerelease');
                }
                await cpUtils.executeCommand(ext.outputChannel, context.projectPath, 'dotnet', 'add', 'package', ...packageArgs);
            } catch {
                failedPackages.push(p.name);
            }
        }

        if (failedPackages.length) {
            ext.outputChannel.appendLog(localize('durableDependencyInstallFailed', 'WARNING: Failed to install and update Durable Functions NuGet packages to the root .csproj project file. You may need to install the following packages manually: "{0}".', failedPackages.join('", "')));
        }
    }

    private async installNodeDependencies(context: IFunctionWizardContext): Promise<void> {
        try {
            const packageVersion = context.languageModel === 4 ? '3' : '2';
            await cpUtils.executeCommand(ext.outputChannel, context.projectPath, 'npm', 'install', `${durableUtils.nodeDfPackage}@${packageVersion}`);
        } catch (error) {
            const pError: IParsedError = parseError(error);
            const dfDepInstallFailed: string = localize('failedToAddDurableNodeDependency', 'Failed to add or install the "{0}" dependency. Please inspect and verify if it needs to be added manually.', durableUtils.nodeDfPackage);
            ext.outputChannel.appendLog(pError.message);
            ext.outputChannel.appendLog(dfDepInstallFailed);
        }
    }

    // #endregion Install Durable Dependencies
}
