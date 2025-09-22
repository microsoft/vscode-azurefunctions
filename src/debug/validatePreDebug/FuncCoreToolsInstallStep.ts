/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, DialogResponses, openUrl } from '@microsoft/vscode-azext-utils';
import * as os from 'os';
import { env, type MessageItem } from 'vscode';
import { funcVersionSetting, type PackageManager } from '../../constants';
import { ext } from '../../extensionVariables';
import { generateLinuxErrorMessages } from '../../funcCoreTools/generateLinuxErrorMessages';
import { getFuncPackageManagers } from '../../funcCoreTools/getFuncPackageManagers';
import { installFuncCoreTools, lastCoreToolsInstallCommand } from '../../funcCoreTools/installFuncCoreTools';
import { getInstallUrl } from '../../funcCoreTools/validateFuncCoreToolsInstalled';
import { tryParseFuncVersion, type FuncVersion } from '../../FuncVersion';
import { localize } from '../../localize';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { type IPreDebugValidateContext } from './IPreDebugValidateContext';

export class FuncCoreToolsInstallStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStep<T> {
    // Todo: Find a good priority value
    public priority: number = 300;

    constructor(readonly packageManagers?: PackageManager[]) {
        super();
    }

    public async execute(context: T): Promise<void> {
        const packageManagers: PackageManager[] = this.packageManagers ?? await getFuncPackageManagers(false /* isFuncInstalled */);

        try {
            const version: FuncVersion | undefined = tryParseFuncVersion(getWorkspaceSetting(funcVersionSetting, context.workspaceFolder.uri.fsPath));
            await installFuncCoreTools(context, packageManagers, version);
        } catch (err) {
            context.shouldAbortDebug = true;

            const buttons: MessageItem[] = [];
            const copyCommand: MessageItem = { title: localize('copyCommand', 'Copy command') };

            let failedInstall: string = localize('failedInstallFuncTools', 'Core Tools installation has failed and will have to be installed manually.');
            if (os.platform() === 'linux') {
                failedInstall += ' ' + (await generateLinuxErrorMessages(!!packageManagers.length /* hasPackageManager */)).failedInstall;
                if (packageManagers.length) {
                    buttons.push(copyCommand);
                }
            }

            buttons.push(DialogResponses.learnMore);

            // Todo: use void?
            const result = await context.ui.showWarningMessage(failedInstall, ...buttons);

            if (result === DialogResponses.learnMore) {
                await openUrl(getInstallUrl());
            } else if (result === copyCommand) {
                const lastInstallCommand: string = lastCoreToolsInstallCommand.join(' ');
                await env.clipboard.writeText(lastInstallCommand);
                ext.outputChannel.appendLog(localize('copiedClipboard', 'Copied to clipboard: "{0}"', lastInstallCommand));
            }
        }
    }

    public shouldExecute(context: T): boolean {
        return !!context.shouldInstallFuncCoreTools;
    }
}
