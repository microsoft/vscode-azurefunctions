/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as opn from 'opn';
import * as semver from 'semver';
import * as vscode from 'vscode';
import { callWithTelemetryAndErrorHandling, DialogResponses, IActionContext, parseError } from 'vscode-azureextensionui';
import { attemptToInstallLatestFunctionRuntime, brewOrNpmInstalled } from '../commands/createNewProject/validateFuncCoreToolsInstalled';
import { isWindows, ProjectRuntime } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getFuncExtensionSetting, updateGlobalSetting } from '../ProjectSettings';
import { cpUtils } from './cpUtils';

export namespace functionRuntimeUtils {
    const runtimePackage: string = 'azure-functions-core-tools';
    enum FunctionRuntimeTag {
        latest = 1,
        core = 2
    }

    export async function validateFunctionRuntime(): Promise<void> {
        await callWithTelemetryAndErrorHandling('azureFunctions.validateFunctionRuntime', ext.reporter, undefined, async function (this: IActionContext): Promise<void> {
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
                    const major: number = semver.major(localVersion);
                    const newestVersion: string | null = await getNewestFunctionRuntimeVersion(major);
                    if (newestVersion === null) {
                        return;
                    }
                    if (semver.gt(newestVersion, localVersion)) {
                        const canUpdate: boolean = await brewOrNpmInstalled();
                        const message: string = canUpdate ? localize(
                            'azFunc.outdatedFunctionRuntimeUpdate',
                            'Your version of the Azure Functions Core Tools ({0}) does not match the latest ({1}). Would you like to update now?',
                            localVersion,
                            newestVersion
                        ) : localize(
                            'azFunc.outdatedFunctionRuntimeSeeMore',
                            'Your version of the Azure Functions Core Tools ({0}) does not match the latest ({1}). Please update for the best experience.',
                            localVersion,
                            newestVersion);

                        const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, canUpdate ? DialogResponses.yes : DialogResponses.learnMore, DialogResponses.dontWarnAgain);
                        if (result === DialogResponses.learnMore) {
                            // tslint:disable-next-line:no-unsafe-any
                            opn('https://aka.ms/azFuncOutdated');
                        } else if (result === DialogResponses.yes) {
                            switch (major) {
                                case FunctionRuntimeTag.latest:
                                    await attemptToInstallLatestFunctionRuntime('v1');
                                case FunctionRuntimeTag.core:
                                    await attemptToInstallLatestFunctionRuntime('v2');
                                default:
                                    break;
                            }
                        } else if (result === DialogResponses.dontWarnAgain) {
                            await updateGlobalSetting(settingKey, false);
                        }
                    }
                } catch (error) {
                    ext.outputChannel.appendLine(`Error occurred when checking the version of 'Azure Functions Core Tools': ${parseError(error).message}`);
                    throw error;
                }
            }
        });
    }

    export async function tryGetLocalRuntimeVersion(): Promise<ProjectRuntime | undefined> {
        if (!isWindows) {
            return ProjectRuntime.beta;
        } else {
            try {
                const version: string | null = await getLocalFunctionRuntimeVersion();
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

    async function getLocalFunctionRuntimeVersion(): Promise<string | null> {
        const versionInfo: string = await cpUtils.executeCommand(undefined, undefined, 'func');
        const matchResult: RegExpMatchArray | null = versionInfo.match(/(?:.*)Azure Functions Core Tools (.*)/);
        if (matchResult !== null) {
            const localVersion: string = matchResult[1].replace(/[()]/g, '').trim(); // remove () and whitespace
            return semver.valid(localVersion);
        }
        return null;
    }

    async function getNewestFunctionRuntimeVersion(major: number): Promise<string | null> {
        switch (major) {
            case FunctionRuntimeTag.latest:
                return semver.valid((await cpUtils.executeCommand(undefined, undefined, 'npm', 'view', runtimePackage, 'dist-tags.latest')).trim());
            case FunctionRuntimeTag.core:
                try {
                    // since Mac OS and Windows may have installed through npm, try that first
                    return semver.valid((await cpUtils.executeCommand(undefined, undefined, 'npm', 'view', runtimePackage, 'dist-tags.core')).trim());
                } catch (error) {
                    // Currently there is no way to check if `brew outdated` works because there are no old versions available of azure-function-core-tools
                    return null;
                }

            default:
                return null;
        }
    }
}
