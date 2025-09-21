/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, DialogResponses, openUrl } from '@microsoft/vscode-azext-utils';
import * as os from 'os';
import { type MessageItem } from 'vscode';
import { type PackageManager } from '../../constants';
import { generateLinuxErrorMessages, type ILinuxErrorMessages } from '../../funcCoreTools/generateLinuxErrorMessages';
import { hasFuncCliSetting } from '../../funcCoreTools/getFuncCliPath';
import { getFuncPackageManagers } from '../../funcCoreTools/getFuncPackageManagers';
import { funcToolsInstalled, getInstallUrl } from '../../funcCoreTools/validateFuncCoreToolsInstalled';
import { localize } from '../../localize';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { type IPreDebugValidateContext } from './IPreDebugValidateContext';

enum FuncCliInstallType {
    Custom = 'custom',
    Bypass = 'bypass',
    AlreadyInstalled = 'alreadyInstalled',
    Prompt = 'prompt',
}

// Todo: Should we pass context.projectPath or context.workspacePath?
export class FuncCoreToolsInstallPromptStep<T extends IPreDebugValidateContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        switch (true) {
            case hasFuncCliSetting():
                // For example, if the path is set to something like "node_modules/.bin/func", that may not exist until _after_ an "npm install" task is run
                // Defer to the func cli path setting instead of checking here
                // context.telemetry.properties.funcCliSource = 'setting';
                context.telemetry.properties.funcCliInstallType = FuncCliInstallType.Custom;
                context.shouldInstallFuncCoreTools = false;
                context.isFuncCoreToolsInstalled = true;
                break;
            case !getWorkspaceSetting<boolean>('validateFuncCoreTools', context.projectPath):
                // User wants to bypass the pre-check for Azure Functions Core Tools
                // context.telemetry.properties.validateFuncCoreTools = 'false';
                context.telemetry.properties.funcCliInstallType = FuncCliInstallType.Bypass;
                context.shouldInstallFuncCoreTools = false;
                context.isFuncCoreToolsInstalled = undefined;
                break;
            case await funcToolsInstalled(context, context.projectPath):
                context.telemetry.properties.funcCliInstallType = FuncCliInstallType.AlreadyInstalled;
                context.shouldInstallFuncCoreTools = false;
                context.isFuncCoreToolsInstalled = true;
                break;
            default:
                context.telemetry.properties.funcCliInstallType = FuncCliInstallType.Prompt;
                context.shouldInstallFuncCoreTools = await this.promptUserInstallFuncCoreTools(context);
                context.isFuncCoreToolsInstalled = false;
        }

        context.telemetry.properties.shouldInstallFuncCoreTools = String(context.shouldInstallFuncCoreTools);
        context.telemetry.properties.isFuncCoreToolsInstalled = context.isFuncCoreToolsInstalled ? String(context.isFuncCoreToolsInstalled) : undefined;
    }

    public shouldPrompt(context: T): boolean {
        return context.shouldInstallFuncCoreTools === undefined;
    }

    private async promptUserInstallFuncCoreTools(context: T): Promise<boolean> {
        const items: MessageItem[] = [];
        const installItem: MessageItem = { title: localize('install', 'Install') };
        const packageManagers: PackageManager[] = await getFuncPackageManagers(false /* isFuncInstalled */);

        let message: string = localize('installFuncTools', 'You must have Azure Functions Core Tools installed to debug your local functions project.');
        if (packageManagers.length) {
            items.push(installItem);
        } else {
            items.push(DialogResponses.learnMore);
            if (os.platform() === 'linux') {
                message += ' ' + (await generateLinuxErrorMessages(false /* hasPackageManager */)).noPackageManager;
            }
        }

        if (os.platform() === 'linux' && !packageManagers.length) {
            const linuxErrorMessages: ILinuxErrorMessages = await generateLinuxErrorMessages(!!packageManagers.length /* hasPackageManager */);
            if (linuxErrorMessages.noPackageManager) {
                message += ' ' + linuxErrorMessages.noPackageManager;
            }
        }

        // See issue: https://github.com/Microsoft/vscode-azurefunctions/issues/535
        const input = await context.ui.showWarningMessage(message, { modal: true }, ...items);
        if (input === installItem) {
            return true;
        } else {
            await openUrl(getInstallUrl());
            return false;
        }
    }
}
