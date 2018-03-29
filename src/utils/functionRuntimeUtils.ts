/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as opn from 'opn';
import * as semver from 'semver';
import * as vscode from 'vscode';
import { callWithTelemetryAndErrorHandling, DialogResponses, IActionContext, IAzureUserInput, parseError } from 'vscode-azureextensionui';
import TelemetryReporter from 'vscode-extension-telemetry';
import { isWindows, Platform, ProjectRuntime } from '../constants';
import { localize } from '../localize';
import { getFuncExtensionSetting, updateGlobalSetting } from '../ProjectSettings';
import { cpUtils } from './cpUtils';

export namespace functionRuntimeUtils {
    const runtimePackage: string = 'azure-functions-core-tools';

    export async function validateFunctionRuntime(reporter: TelemetryReporter | undefined, ui: IAzureUserInput, outputChannel: vscode.OutputChannel): Promise<void> {
        await callWithTelemetryAndErrorHandling('azureFunctions.validateFunctionRuntime', reporter, undefined, async function (this: IActionContext): Promise<void> {
            this.suppressErrorDisplay = true;
            this.properties.isActivationEvent = 'true';

            const settingKey: string = 'showCoreToolsWarning';
            if (getFuncExtensionSetting<boolean>(settingKey)) {
                try {
                    const localVersion: string | null = await getLocalFunctionRuntimeVersion();
                    if (localVersion === null) {
                        return;
                    }
                    this.properties.localVersion = localVersion;
                    const newestVersion: string | null = await getNewestFunctionRuntimeVersion(semver.major(localVersion));
                    if (newestVersion === null) {
                        return;
                    }
                    if (semver.gt(newestVersion, localVersion)) {
                        const message: string = localize(
                            'azFunc.outdatedFunctionRuntime',
                            'Your version of the Azure Functions Core Tools ({0}) does not match the latest ({1}). Please update for the best experience.',
                            localVersion,
                            newestVersion
                        );

                        const result: vscode.MessageItem = await ui.showWarningMessage(message, DialogResponses.learnMore, DialogResponses.dontWarnAgain);
                        if (result === DialogResponses.learnMore) {
                            // tslint:disable-next-line:no-unsafe-any
                            opn('https://aka.ms/azFuncOutdated');
                        } else if (result === DialogResponses.dontWarnAgain) {
                            await updateGlobalSetting(settingKey, false);
                        }
                    }
                } catch (error) {
                    outputChannel.appendLine(`Error occurred when checking the version of 'Azure Functions Core Tools': ${parseError(error).message}`);
                    throw error;
                }
            }
        });
    }

    export async function tryGetLocalRuntimeVersion(outputChannel: vscode.OutputChannel): Promise<ProjectRuntime | undefined> {
        if (!isWindows) {
            return ProjectRuntime.beta;
        } else {
            try {
                const version: string | null = await getLocalFunctionRuntimeVersion(outputChannel);
                if (version !== null) {
                    switch (semver.major(version)) {
                        case 2:
                            return ProjectRuntime.beta;
                        case 1:
                            return ProjectRuntime.one;
                        default:
                            return undefined;
                    }
                }
            } catch (err) {
                // swallow errors and return undefined
            }

            return undefined;
        }
    }

    async function getLocalFunctionRuntimeVersion(outputChannel: vscode.OutputChannel): Promise<string | null> {
        try {
            const versionInfo: string = await cpUtils.executeCommand(undefined, undefined, 'func');
            const matchResult: RegExpMatchArray | null = versionInfo.match(/(?:.*)Function Runtime Version: (.*)/);
            if (matchResult !== null) {
                const localVersion: string = matchResult[1].trim();
                return semver.valid(localVersion);
            }
            return null;
        } catch (error) {
            await thinkOfNameLater(outputChannel);
            return null;
        }
    }

    enum FunctionRuntimeTag {
        latest = 1,
        core = 2
    }

    async function getNewestFunctionRuntimeVersion(major: number): Promise<string | null> {
        switch (major) {
            case FunctionRuntimeTag.latest:
                return semver.valid((await cpUtils.executeCommand(undefined, undefined, 'npm', 'view', runtimePackage, 'dist-tags.latest')).trim());
            case FunctionRuntimeTag.core:
                return semver.valid((await cpUtils.executeCommand(undefined, undefined, 'npm', 'view', runtimePackage, 'dist-tags.core')).trim());
            default:
                return null;
        }
    }

    async function thinkOfNameLater(outputChannel: vscode.OutputChannel): Promise<void> {
        try {
            switch (process.platform) {
                case Platform.Windows:
                    await cpUtils.executeCommand(outputChannel, undefined, 'npm', 'install', '-g', 'azure-functions-core-tools@core', '--unsafe-perm', 'true');
                    break;
                case Platform.MacOS:
                    try {
                        await cpUtils.executeCommand(outputChannel, undefined, 'npm', 'install', '-g', 'azure-functions-core-tools@core', '--unsafe-perm', 'true');
                    } catch (error) {
                        try {
                            await cpUtils.executeCommand(outputChannel, undefined, 'brew', 'tap', 'azure/functions');
                            await cpUtils.executeCommand(outputChannel, undefined, 'brew', 'install', 'azure-functions-core-tools');
                        } catch (error) {
                            console.log(error);
                        }
                    }
                    break;
                case Platform.Linux:
                    try {
                        await cpUtils.executeCommand(outputChannel, undefined, 'curl', 'https://packages.microsoft.com/keys/microsoft.asc', '|', 'gpg', '--dearmor', '>', 'microsoft.gpg');
                        await cpUtils.executeCommand(outputChannel, undefined, 'sudo', 'mv', 'microsoft.gpg /etc/apt/trusted.gpg.d/microsoft.gpg');
                        // a lot of different OS's use different cmds...

                    } catch (error) {
                        console.log(error);
                    }
                    break;
                default:
                    console.log('I dunno');
            }
        } catch (error) {
            console.log(error);
        }

    }
}
