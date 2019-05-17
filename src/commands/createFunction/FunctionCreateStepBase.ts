/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { Progress, Uri, window, workspace } from 'vscode';
import { AzureWizardExecuteStep, callWithTelemetryAndErrorHandling, IActionContext, parseError } from 'vscode-azureextensionui';
import { extInstallCommand, hostFileName, ProjectLanguage, ProjectRuntime, settingsFileName, tasksFileName, vscodeFolderName } from '../../constants';
import { ext } from '../../extensionVariables';
import { IHostJsonV2 } from '../../funcConfig/host';
import { localize } from '../../localize';
import { IFunctionTemplate } from '../../templates/IFunctionTemplate';
import { writeFormattedJson } from '../../utils/fs';
import { nonNullProp } from '../../utils/nonNull';
import { getContainingWorkspace } from '../../utils/workspace';
import { IFunctionWizardContext } from './IFunctionWizardContext';

interface ICachedFunction {
    projectPath: string;
    newFilePath: string;
    isHttpTrigger: boolean;
}

const cacheKey: string = 'azFuncPostFunctionCreate';

export function runPostFunctionCreateStepsFromCache(): void {
    const cachedFunc: ICachedFunction | undefined = ext.context.globalState.get(cacheKey);
    if (cachedFunc) {
        try {
            runPostFunctionCreateSteps(cachedFunc);
        } finally {
            ext.context.globalState.update(cacheKey, undefined);
        }
    }
}

export abstract class FunctionCreateStepBase<T extends IFunctionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 220;

    /**
     * Returns the full path to the new function file
     */
    public abstract executeCore(context: T): Promise<string>;

    public async execute(context: T, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        const template: IFunctionTemplate = nonNullProp(context, 'functionTemplate');

        context.properties.projectLanguage = context.language;
        context.properties.projectRuntime = context.runtime;
        context.properties.templateId = template.id;

        progress.report({ message: localize('creatingFunction', 'Creating new {0}...', template.name) });

        const newFilePath: string = await this.executeCore(context);
        if (await this.shouldUseExtensionBundle(context, template)) {
            await this.verifyExtensionBundle(context);
        }

        const cachedFunc: ICachedFunction = { projectPath: context.projectPath, newFilePath, isHttpTrigger: template.isHttpTrigger };

        if (context.openBehavior) {
            // OpenFolderStep sometimes restarts the extension host, so we will cache this to run on the next extension activation
            ext.context.globalState.update(cacheKey, cachedFunc);
            // Delete cached information if the extension host was not restarted after 5 seconds
            setTimeout(() => { ext.context.globalState.update(cacheKey, undefined); }, 5 * 1000);
        }

        runPostFunctionCreateSteps(cachedFunc);
    }

    public async verifyExtensionBundle(context: T): Promise<void> {
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

    public shouldExecute(context: T): boolean {
        return !!context.functionTemplate;
    }

    private async shouldUseExtensionBundle(context: T, template: IFunctionTemplate): Promise<boolean> {
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
}

function runPostFunctionCreateSteps(func: ICachedFunction): void {
    // Don't wait
    // tslint:disable-next-line: no-floating-promises
    callWithTelemetryAndErrorHandling('postFunctionCreate', async (context: IActionContext) => {
        context.suppressTelemetry = true;

        if (getContainingWorkspace(func.projectPath)) {
            if (await fse.pathExists(func.newFilePath)) {
                window.showTextDocument(await workspace.openTextDocument(Uri.file(func.newFilePath)));
            }
        }
    });
}
