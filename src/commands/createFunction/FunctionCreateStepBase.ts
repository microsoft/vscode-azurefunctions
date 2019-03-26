/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { Progress, Uri, window, workspace } from 'vscode';
import { AzureWizardExecuteStep, callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { localSettingsFileName } from '../../constants';
import { ext } from '../../extensionVariables';
import { validateAzureWebJobsStorage } from '../../LocalAppSettings';
import { localize } from '../../localize';
import { IFunctionTemplate } from '../../templates/IFunctionTemplate';
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
            if (getContainingWorkspace(cachedFunc.projectPath)) {
                runPostFunctionCreateSteps(cachedFunc);
            }
        } finally {
            ext.context.globalState.update(cacheKey, undefined);
        }
    }
}

export abstract class FunctionCreateStepBase<T extends IFunctionWizardContext> extends AzureWizardExecuteStep<T> {
    /**
     * Returns the full path to the new function file
     */
    public abstract executeCore(wizardContext: T): Promise<string>;

    public async execute(wizardContext: T, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        const template: IFunctionTemplate = nonNullProp(wizardContext, 'functionTemplate');

        wizardContext.actionContext.properties.projectLanguage = wizardContext.language;
        wizardContext.actionContext.properties.projectRuntime = wizardContext.runtime;
        wizardContext.actionContext.properties.templateId = template.id;

        progress.report({ message: localize('creatingFunction', 'Creating new {0}...', template.name) });

        const newFilePath: string = await this.executeCore(wizardContext);
        const cachedFunc: ICachedFunction = { projectPath: wizardContext.projectPath, newFilePath, isHttpTrigger: template.isHttpTrigger };

        if (wizardContext.openBehavior) {
            // OpenFolderStep sometimes restarts the extension host, so we will cache this to run on the next extension activation
            ext.context.globalState.update(cacheKey, cachedFunc);
            // Delete cached information if the extension host was not restarted after 5 seconds
            setTimeout(() => { ext.context.globalState.update(cacheKey, undefined); }, 5 * 1000);
        }

        runPostFunctionCreateSteps(cachedFunc);
    }

    public shouldExecute(wizardContext: T): boolean {
        return !!wizardContext.functionTemplate;
    }
}

function runPostFunctionCreateSteps(func: ICachedFunction): void {
    // Don't wait
    // tslint:disable-next-line: no-floating-promises
    callWithTelemetryAndErrorHandling('postFunctionCreate', async function (this: IActionContext): Promise<void> {
        if (await fse.pathExists(func.newFilePath)) {
            window.showTextDocument(await workspace.openTextDocument(Uri.file(func.newFilePath)));
        }

        if (!func.isHttpTrigger) {
            const localSettingsPath: string = path.join(func.projectPath, localSettingsFileName);
            await validateAzureWebJobsStorage(this, localSettingsPath);
        }
    });
}
