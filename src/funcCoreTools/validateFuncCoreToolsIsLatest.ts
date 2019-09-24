/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import * as vscode from 'vscode';
import { callWithTelemetryAndErrorHandling, DialogResponses, IActionContext, parseError } from 'vscode-azureextensionui';
import { PackageManager, ProjectRuntime } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { openUrl } from '../utils/openUrl';
import { requestUtils } from '../utils/requestUtils';
import { convertStringToRuntime, getWorkspaceSetting, updateGlobalSetting } from '../vsCodeConfig/settings';
import { getFuncPackageManagers } from './getFuncPackageManagers';
import { getLocalFuncCoreToolsVersion } from './getLocalFuncCoreToolsVersion';
import { getNpmDistTag } from "./getNpmDistTag";
import { uninstallFuncCoreTools } from './uninstallFuncCoreTools';
import { updateFuncCoreTools } from './updateFuncCoreTools';

export async function validateFuncCoreToolsIsLatest(): Promise<void> {
    await callWithTelemetryAndErrorHandling('azureFunctions.validateFuncCoreToolsIsLatest', async (context: IActionContext) => {
        context.errorHandling.suppressDisplay = true;
        context.telemetry.properties.isActivationEvent = 'true';

        const showMultiCoreToolsWarningKey: string = 'showMultiCoreToolsWarning';
        const showMultiCoreToolsWarning: boolean = !!getWorkspaceSetting<boolean>(showMultiCoreToolsWarningKey);

        const showCoreToolsWarningKey: string = 'showCoreToolsWarning';
        const showCoreToolsWarning: boolean = !!getWorkspaceSetting<boolean>(showCoreToolsWarningKey);

        if (showCoreToolsWarning || showMultiCoreToolsWarning) {
            const packageManagers: PackageManager[] = await getFuncPackageManagers(true /* isFuncInstalled */);
            let packageManager: PackageManager;
            if (packageManagers.length === 0) {
                return;
            } else if (packageManagers.length === 1) {
                packageManager = packageManagers[0];
            } else {
                context.telemetry.properties.multiFunc = 'true';
                if (showMultiCoreToolsWarning) {
                    const message: string = localize('multipleInstalls', 'Detected multiple installs of the func cli.');
                    const selectUninstall: vscode.MessageItem = { title: localize('selectUninstall', 'Select version to uninstall') };
                    const result: vscode.MessageItem = await ext.ui.showWarningMessage(message, selectUninstall, DialogResponses.dontWarnAgain);
                    if (result === selectUninstall) {
                        await uninstallFuncCoreTools(context, packageManagers);
                    } else if (result === DialogResponses.dontWarnAgain) {
                        await updateGlobalSetting(showMultiCoreToolsWarningKey, false);
                    }
                }

                return;
            }

            if (showCoreToolsWarning) {
                const localVersion: string | null = await getLocalFuncCoreToolsVersion();
                if (!localVersion) {
                    return;
                }
                context.telemetry.properties.localVersion = localVersion;

                const projectRuntime: ProjectRuntime | undefined = convertStringToRuntime(localVersion);
                if (projectRuntime === undefined) {
                    return;
                }

                const newestVersion: string | undefined = await getNewestFunctionRuntimeVersion(packageManager, projectRuntime, context);
                if (!newestVersion) {
                    return;
                }

                if (semver.gt(newestVersion, localVersion)) {
                    context.telemetry.properties.outOfDateFunc = 'true';
                    const message: string = localize(
                        'azFunc.outdatedFunctionRuntime',
                        'Update your Azure Functions Core Tools ({0}) to the latest ({1}) for the best experience.',
                        localVersion,
                        newestVersion
                    );

                    const update: vscode.MessageItem = { title: 'Update' };
                    let result: vscode.MessageItem;

                    do {
                        result = packageManager !== undefined ? await ext.ui.showWarningMessage(message, update, DialogResponses.learnMore, DialogResponses.dontWarnAgain) :
                            await ext.ui.showWarningMessage(message, DialogResponses.learnMore, DialogResponses.dontWarnAgain);
                        if (result === DialogResponses.learnMore) {
                            await openUrl('https://aka.ms/azFuncOutdated');
                        } else if (result === update) {
                            await updateFuncCoreTools(packageManager, projectRuntime);
                        } else if (result === DialogResponses.dontWarnAgain) {
                            await updateGlobalSetting(showCoreToolsWarningKey, false);
                        }
                    }
                    while (result === DialogResponses.learnMore);
                }
            }
        }
    });
}

async function getNewestFunctionRuntimeVersion(packageManager: PackageManager | undefined, projectRuntime: ProjectRuntime, context: IActionContext): Promise<string | undefined> {
    try {
        if (packageManager === PackageManager.brew) {
            const brewRegistryUri: string = 'https://aka.ms/AA1t7go';
            const request: requestUtils.Request = await requestUtils.getDefaultRequest(brewRegistryUri);
            const brewInfo: string = await requestUtils.sendRequest(request);
            const matches: RegExpMatchArray | null = brewInfo.match(/version\s+["']([^"']+)["']/i);
            if (matches && matches.length > 1) {
                return matches[1];
            }
        } else {
            return (await getNpmDistTag(projectRuntime)).value;
        }
    } catch (error) {
        context.telemetry.properties.latestRuntimeError = parseError(error).message;
    }

    return undefined;
}
