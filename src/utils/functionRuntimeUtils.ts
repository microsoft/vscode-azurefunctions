/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as opn from 'opn';
// tslint:disable-next-line:no-require-imports
import request = require('request-promise');
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
        // https://github.com/Microsoft/vscode-azurefunctions/issues/343
        const versionInfo: string = await cpUtils.executeCommand(undefined, undefined, 'func');
        const matchResult: RegExpMatchArray | null = versionInfo.match(/(?:.*)Azure Functions Core Tools (.*)/);
        if (matchResult !== null) {
            let localVersion: string = matchResult[1].replace(/[()]/g, '').trim(); // remove () and whitespace
            // this is a fix for a bug currently in the Function CLI
            if (localVersion === '220.0.0-beta.0') {
                localVersion = '2.0.1-beta.25';
            }
            return semver.valid(localVersion);
        }
        return null;
    }

    async function getNewestFunctionRuntimeVersion(major: number): Promise<string | null> {
        // tslint:disable-next-line:no-http-string
        const npmRegistryUri: string = 'http://registry.npmjs.org/-/package/azure-functions-core-tools/dist-tags';
        type distTags = { core: string, docker: string, latest: string };
        const distTags: distTags = <distTags>JSON.parse((await <Thenable<string>>request(npmRegistryUri).promise()));
        switch (major) {
            case FunctionRuntimeTag.latest:
                return distTags.latest;
            case FunctionRuntimeTag.core:
                return distTags.core;
            default:
                return null;
        }
    }
}
