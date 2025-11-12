/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { FuncVersion } from '../FuncVersion';
import { type IBindingWizardContext } from '../commands/addBinding/IBindingWizardContext';
import { type IFunctionWizardContext } from '../commands/createFunction/IFunctionWizardContext';
import { ProjectLanguage, extInstallCommand, extensionsCsprojFileName, hostFileName, settingsFileName, tasksFileName, vscodeFolderName } from '../constants';
import { type IHostJsonV2 } from '../funcConfig/host';
import { localize } from '../localize';
import { type IBindingTemplate } from '../templates/IBindingTemplate';
import { type FunctionTemplateBase } from '../templates/IFunctionTemplate';
import { promptToReinitializeProject } from '../vsCodeConfig/promptToReinitializeProject';
import { bundleFeedUtils } from './bundleFeedUtils';

export async function verifyExtensionBundle(context: IFunctionWizardContext | IBindingWizardContext, template: FunctionTemplateBase | IBindingTemplate): Promise<void> {
    // v1 doesn't support bundles
    // http and timer triggers don't need a bundle
    // F# and C# specify extensions as dependencies in their proj file instead of using a bundle
    if (context.version === FuncVersion.v1 ||
        !bundleFeedUtils.isBundleTemplate(template) ||
        context.language === ProjectLanguage.CSharp || context.language === ProjectLanguage.FSharp) {
        context.telemetry.properties.bundleResult = 'n/a';
        return;
    }

    // Don't use bundle if set up to use "extensions.csproj". More discussion here: https://github.com/microsoft/vscode-azurefunctions/issues/1698
    if (await hasExtensionsVSCodeConfig(context, context.workspacePath) || await hasExtensionsCsproj(context, context.projectPath)) {
        context.telemetry.properties.bundleResult = 'hasExtensionsConfig';
    } else {
        const hostFilePath: string = path.join(context.projectPath, hostFileName);
        if (!(await AzExtFsExtra.pathExists(hostFilePath))) {
            context.telemetry.properties.bundleResult = 'missingHostJson';
        } else {
            let hostJson: IHostJsonV2;
            try {
                hostJson = await AzExtFsExtra.readJSON<IHostJsonV2>(hostFilePath);
            } catch (error) {
                context.telemetry.properties.bundleResult = 'failedToParseHostJson';
                // ignore error - no need to block create process just to verify bundle
                return;
            }

            if (!hostJson.extensionBundle) {
                context.telemetry.properties.bundleResult = 'addedBundle';
                await bundleFeedUtils.addDefaultBundle(context, hostJson);
                await AzExtFsExtra.writeJSON(hostFilePath, hostJson);
            } else {
                context.telemetry.properties.bundleResult = 'alreadyHasBundle';
            }
            // TODO: This isn't working, need to debug it
            if (context.hasMcpTrigger && hostJson.extensionBundle?.version) {
                if (bundleFeedUtils.isRangeLessThan(hostJson.extensionBundle?.version, '4.29.0')) {
                    // MCP triggers need at least 4.29.0
                    bundleFeedUtils.overwriteExtensionBundleVersion(hostJson,
                        await bundleFeedUtils.getLatestVersionRange(context),
                        '[4.29.0, 5.0.0)');
                }
            }
        }
    }
}

export async function verifyExtensionsConfig(context: IActionContext, workspacePath: string, projectPath: string): Promise<void> {
    if (await hasExtensionsCsproj(context, projectPath) && !await hasExtensionsVSCodeConfig(context, workspacePath)) {
        const message: string = localize('mismatchExtensionsCsproj', 'Your project is not configured to work with "extensions.csproj".');
        await promptToReinitializeProject(projectPath, 'showExtensionsCsprojWarning', message, 'https://aka.ms/AA8wo2c', context);
    }
}

async function hasExtensionsVSCodeConfig(context: IActionContext, workspacePath: string): Promise<boolean> {
    let result: boolean = false;
    try {
        const filesToCheck: string[] = [tasksFileName, settingsFileName];
        for (const file of filesToCheck) {
            const filePath: string = path.join(workspacePath, vscodeFolderName, file);
            if (await AzExtFsExtra.pathExists(filePath)) {
                const contents: string = (await AzExtFsExtra.readFile(filePath)).toString();
                if (contents.includes(extInstallCommand)) {
                    result = true;
                    break;
                }
            }
        }
    } catch {
        // ignore and use default
    }

    context.telemetry.properties.hasExtensionsVSCodeConfig = String(result);
    return result;
}

async function hasExtensionsCsproj(context: IActionContext, projectPath: string): Promise<boolean> {
    let result: boolean = false;
    try {
        result = await AzExtFsExtra.pathExists(path.join(projectPath, extensionsCsprojFileName));
    } catch {
        // ignore and use default
    }

    context.telemetry.properties.hasExtensionsCsproj = String(result);
    return result;
}
