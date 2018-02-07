/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as opn from 'opn';
import * as semver from 'semver';
import * as vscode from 'vscode';
import { extensionPrefix } from '../../src/ProjectSettings';
import { DialogResponses } from '../DialogResponses';
import { localize } from '../localize';
import { cpUtils } from './cpUtils';

export namespace functionRuntimeUtils {

    const runtimePackage: string = 'azure-functions-core-tools';

    export async function validateFunctionRuntime(outputChannel: vscode.OutputChannel): Promise<void> {
        try {
            const localVersion: string | null = await getLocalFunctionRuntimeVersion();
            if (!localVersion) {
                return;
            }
            const newestVersion: string | null = await getNewestFunctionRuntimeVersion(semver.major(localVersion));
            if (!newestVersion) {
                return;
            }
            if (semver.gt(newestVersion, localVersion)) {
                await promptDocumentationAction(
                    localize(
                        'azFunc.outdatedFunctionRuntime',
                        '[Azure Functions] Your installed version of the Azure Functions Core Tools ("{0}") does not match the latest ("{1}"). Please update for the best experience.',
                        localVersion,
                        newestVersion
                    )
                );
            }
        } catch (error) {
            outputChannel.appendLine(`Error occurred when checking function runtime: ${error}`);
        }

        return undefined;
    }

    async function getLocalFunctionRuntimeVersion(): Promise<string | null> {
        const versionInfo: string = await cpUtils.executeCommand(undefined, undefined, 'npm', 'ls', runtimePackage, '-g');
        const matchResult: RegExpMatchArray | null = versionInfo.match(/(?:.*)azure-functions-core-tools@(.*)/);
        if (matchResult) {
            const localVersion: string = matchResult[1].trim();
            return semver.valid(localVersion);
        }
        return null;
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

    async function promptDocumentationAction(message: string): Promise<void> {
        const result: vscode.MessageItem | undefined = await vscode.window.showWarningMessage(message, DialogResponses.seeMoreInfo, DialogResponses.dontWarnAgain);
        if (result === DialogResponses.seeMoreInfo) {
            // tslint:disable-next-line:no-unsafe-any
            opn('https://aka.ms/azFuncOutdated');
        } else if (result === DialogResponses.dontWarnAgain) {
            await vscode.workspace.getConfiguration(extensionPrefix).update(
                'showCoreToolsWarning',
                false /* value */,
                true /* User Setting */
            );
        }
    }

    enum FunctionRuntimeTag {
        latest = 1,
        core = 2
    }
}
