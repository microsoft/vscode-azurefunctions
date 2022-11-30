/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStep, IParsedError, parseError } from '@microsoft/vscode-azext-utils';
import * as path from "path";
import { Progress } from 'vscode';
import { ConnectionKey, DurableBackend, hostFileName, ProjectLanguage } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { IHostJsonV2 } from '../../../funcConfig/host';
import { MismatchBehavior, setLocalAppSetting } from '../../../funcConfig/local.settings';
import { localize } from '../../../localize';
import { cpUtils } from '../../../utils/cpUtils';
import { durableUtils, netheriteUtils, sqlUtils } from '../../../utils/durableUtils';
import { pythonUtils } from '../../../utils/pythonUtils';
import { venvUtils } from '../../../utils/venvUtils';
import { IFunctionWizardContext } from '../IFunctionWizardContext';

export class DurableProjectConfigureStep<T extends IFunctionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 225;

    public async execute(context: T, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const configuring: string = localize('configuringDurableProject', 'Configuring durable project settings...');
        progress.report({ message: configuring });

        await this._configureHostAndLocalSettingsJson(context);
        await this._tryInstallDurableDependencies(context);
    }

    public shouldExecute(context: T): boolean {
        return !!context.newDurableStorageType;
    }

    private async _configureHostAndLocalSettingsJson(context: T): Promise<void> {
        const hostJsonPath: string = path.join(context.projectPath, hostFileName);
        if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
            const message: string = localize('failedToFindHost', 'Failed to find "{0}" in your project root.', hostFileName);
            throw new Error(message);
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
                await setLocalAppSetting(context, context.projectPath, ConnectionKey.EventHub, '', MismatchBehavior.Overwrite);
                break;
            case DurableBackend.SQL:
                hostJson.extensions.durableTask = sqlUtils.getDefaultSqlTaskConfig();
                await setLocalAppSetting(context, context.projectPath, ConnectionKey.SQL, '', MismatchBehavior.Overwrite);
                break;
            default:
        }

        await AzExtFsExtra.writeJSON(hostJsonPath, hostJson);
    }

    private async _tryInstallDurableDependencies(context: T): Promise<void> {
        switch (context.language) {
            case ProjectLanguage.Java:
                // Todo: Revisit when adding Java implementation
                break;
            case ProjectLanguage.CSharp:
            case ProjectLanguage.FSharp:
                await this._installDotnetDependencies(context);
                break;
            case ProjectLanguage.JavaScript:
            case ProjectLanguage.TypeScript:
                await this._installNodeDependencies(context);
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

    private async _installNodeDependencies(context: T): Promise<void> {
        try {
            await cpUtils.executeCommand(ext.outputChannel, context.projectPath, 'npm', 'install', durableUtils.nodeDfPackage);
        } catch (error) {
            const pError: IParsedError = parseError(error);
            const dfDepInstallFailed: string = localize('failedToAddDurableNodeDependency', 'Failed to add or install the "{0}" dependency. Please inspect and verify if it needs to be added manually.', durableUtils.nodeDfPackage);
            ext.outputChannel.appendLog(pError.message);
            ext.outputChannel.appendLog(dfDepInstallFailed);
        }
    }

    private async _installDotnetDependencies(context: T): Promise<void> {
        const packageNames: string[] = [];
        switch (context.newDurableStorageType) {
            case DurableBackend.Netherite:
                packageNames.push(durableUtils.dotnetDfNetheritePackage);
                break;
            case DurableBackend.SQL:
                packageNames.push(durableUtils.dotnetDfSqlPackage);
                break;
            case DurableBackend.Storage:
            default:
        }

        // Seems that the package arrives out-dated and needs to be updated
        packageNames.push(durableUtils.dotnetDfBasePackage);

        const failedPackages: string[] = [];
        for (const packageName of packageNames) {
            try {
                await cpUtils.executeCommand(ext.outputChannel, context.projectPath, 'dotnet', 'add', 'package', packageName);
            } catch {
                failedPackages.push(packageName);
            }
        }

        if (failedPackages.length) {
            ext.outputChannel.appendLog(localize('durableDependencyInstallFailed', 'WARNING: Failed to install and update Durable Functions NuGet packages to the root .csproj project file. You may need to install the following packages manually: "{0}".', failedPackages.join('", "')));
        }
    }
}
