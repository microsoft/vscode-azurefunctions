/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { parseError } from 'vscode-azureextensionui';
import { IFunctionWizardContext } from '../commands/createFunction/IFunctionWizardContext';
import { extInstallCommand, hostFileName, ProjectLanguage, ProjectRuntime, settingsFileName, tasksFileName, vscodeFolderName } from '../constants';
import { IHostJsonV2 } from '../funcConfig/host';
import { localize } from '../localize';
import { IFunctionTemplate } from '../templates/IFunctionTemplate';
import { writeFormattedJson } from './fs';

export async function verifyExtensionBundle(context: IFunctionWizardContext): Promise<void> {
    const hostFilePath: string = path.join(context.projectPath, hostFileName);
    try {
        const hostJson: IHostJsonV2 = <IHostJsonV2>await fse.readJSON(hostFilePath);
        if (!hostJson.extensionBundle) {
            // https://github.com/Microsoft/vscode-azurefunctions/issues/1202
            hostJson.extensionBundle = {
                id: 'Microsoft.Azure.Functions.ExtensionBundle',
                version: '[1.*, 2.0.0)'
            };
            await writeFormattedJson(hostFilePath, hostJson);
        }
    } catch (error) {
        throw new Error(localize('failedToParseHostJson', 'Failed to parse {0}: {1}', hostFileName, parseError(error).message));
    }
}

export async function shouldUseExtensionBundle(context: IFunctionWizardContext, template: IFunctionTemplate): Promise<boolean> {
    // v1 doesn't support bundles
    // http and timer triggers don't need a bundle
    // F# and C# specify extensions as dependencies in their proj file instead of using a bundle
    if (context.runtime === ProjectRuntime.v1 ||
        template.isHttpTrigger || template.isTimerTrigger ||
        context.language === ProjectLanguage.CSharp || context.language === ProjectLanguage.FSharp) {
        return false;
    }

    // Old projects setup to use "func extensions install" shouldn't use a bundle because it could lead to duplicate or conflicting binaries
    try {
        const filesToCheck: string[] = [tasksFileName, settingsFileName];
        for (const file of filesToCheck) {
            const filePath: string = path.join(context.workspacePath, vscodeFolderName, file);
            if (await fse.pathExists(filePath)) {
                const contents: string = (await fse.readFile(filePath)).toString();
                if (contents.includes(extInstallCommand)) {
                    return false;
                }
            }
        }
    } catch {
        // ignore and use bundles (the default for new projects)
    }

    return true;
}
