/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DialogResponses } from "@microsoft/vscode-azext-utils";
import * as vscode from 'vscode';
import { IProjectWizardContext } from "../commands/createNewProject/IProjectWizardContext";
import { localize } from '../localize';
import { openUrl } from '../utils/openUrl';
import { cpUtils } from './cpUtils';

export namespace ballerinaUtils {
    const ballerinaCommand: string = 'bal';

    export async function executeInit(context: IProjectWizardContext): Promise<void> {
        try {
            await cpUtils.executeCommand(undefined, context.projectPath, ballerinaCommand, 'init');
        } catch (error) {
            handleBallerinaNotFoundErr(context);
        }
    }

    export async function getBallerinaVersion(context: IProjectWizardContext): Promise<number> {
        const ballerinaVersion: number | undefined = await checkVersionByCLI();
        if (!ballerinaVersion) {
            handleBallerinaNotFoundErr(context);
        }
        return ballerinaVersion;
    }

    function handleBallerinaNotFoundErr(context: IProjectWizardContext): never {
        const message: string = localize('ballerinaNotFound', 'Failed to get Ballerina installation. Please ensure that Ballerina is in your system path');

        if (!context.errorHandling.suppressDisplay) {
            // don't wait
            void vscode.window.showErrorMessage(message, DialogResponses.learnMore).then(async (result) => {
                if (result === DialogResponses.learnMore) {
                    await openUrl('https://ballerina.io/downloads/');
                }
            });
            context.errorHandling.suppressDisplay = true;
        }

        throw new Error(message);
    }

    async function checkVersionByCLI(): Promise<number | undefined> {
        const result: cpUtils.ICommandResult = await cpUtils.tryExecuteCommand(undefined, undefined, "bal", '--version');
        const output: string = result.cmdOutputIncludingStderr;
        const regexp = /Ballerina (\d+\.\d+\.\d+)/;
        const match = regexp.exec(output);
        return match ? flattenMajorVersion(match[1]) : undefined;
    }

    function flattenMajorVersion(version: string): number {
        const regexp = /\d+/g;
        const match = regexp.exec(version);
        let javaVersion = 0;
        if (match) {
            javaVersion = parseInt(match[0], 10);
        }

        return javaVersion;
    }
}
