/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import { Progress, Uri, window, workspace } from 'vscode';
import { AzureWizardExecuteStep, callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { IFunctionTemplate } from '../../templates/IFunctionTemplate';
import { nonNullProp } from '../../utils/nonNull';
import { verifyExtensionBundle } from '../../utils/verifyExtensionBundle';
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

        context.telemetry.properties.projectLanguage = context.language;
        context.telemetry.properties.projectRuntime = context.version;
        context.telemetry.properties.templateId = template.id;

        progress.report({ message: localize('creatingFunction', 'Creating new {0}...', template.name) });

        const newFilePath: string = await this.executeCore(context);
        await verifyExtensionBundle(context, template);

        const cachedFunc: ICachedFunction = { projectPath: context.projectPath, newFilePath, isHttpTrigger: template.isHttpTrigger };

        if (context.openBehavior) {
            // OpenFolderStep sometimes restarts the extension host, so we will cache this to run on the next extension activation
            ext.context.globalState.update(cacheKey, cachedFunc);
            // Delete cached information if the extension host was not restarted after 5 seconds
            setTimeout(() => { ext.context.globalState.update(cacheKey, undefined); }, 5 * 1000);
        }

        runPostFunctionCreateSteps(cachedFunc);
    }

    public shouldExecute(context: T): boolean {
        return !!context.functionTemplate;
    }
}

function runPostFunctionCreateSteps(func: ICachedFunction): void {
    // Don't wait
    // tslint:disable-next-line: no-floating-promises
    callWithTelemetryAndErrorHandling('postFunctionCreate', async (context: IActionContext) => {
        context.telemetry.suppressIfSuccessful = true;

        if (getContainingWorkspace(func.projectPath)) {
            if (await fse.pathExists(func.newFilePath)) {
                window.showTextDocument(await workspace.openTextDocument(Uri.file(func.newFilePath)));
            }
        }
    });
}
