/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStep, callWithTelemetryAndErrorHandling, IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { Progress, Uri, window, workspace } from 'vscode';
import { DurableBackend, hostFileName } from '../../constants';
import { ext } from '../../extensionVariables';
import { IHostJsonV2 } from '../../funcConfig/host';
import { MismatchBehavior, setLocalAppSetting } from '../../funcConfig/local.settings';
import { hostJsonConfigFailed, localize } from '../../localize';
import { IFunctionTemplate } from '../../templates/IFunctionTemplate';
import { durableUtils, netheriteUtils, sqlUtils } from '../../utils/durableUtils';
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

export async function runPostFunctionCreateStepsFromCache(): Promise<void> {
    const cachedFunc: ICachedFunction | undefined = ext.context.globalState.get(cacheKey);
    if (cachedFunc) {
        try {
            runPostFunctionCreateSteps(cachedFunc);
        } finally {
            await ext.context.globalState.update(cacheKey, undefined);
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
        await this._configureForDurableStorageIfNeeded(context);
        await verifyExtensionBundle(context, template);

        const cachedFunc: ICachedFunction = { projectPath: context.projectPath, newFilePath, isHttpTrigger: template.isHttpTrigger };
        const hostFilePath: string = path.join(context.projectPath, hostFileName);
        if (await AzExtFsExtra.pathExists(hostFilePath)) {
            if (context.functionTemplate?.isDynamicConcurrent) {
                const hostJson = await AzExtFsExtra.readJSON<IHostJsonV2>(hostFilePath);
                hostJson.concurrency = {
                    dynamicConcurrencyEnabled: true,
                    snapshotPersistenceEnabled: true
                }
                await AzExtFsExtra.writeJSON(hostFilePath, hostJson);
            }
        }

        if (context.openBehavior) {
            // OpenFolderStep sometimes restarts the extension host, so we will cache this to run on the next extension activation
            await ext.context.globalState.update(cacheKey, cachedFunc);
            // Delete cached information if the extension host was not restarted after 5 seconds
            setTimeout(() => { void ext.context.globalState.update(cacheKey, undefined); }, 5 * 1000);
        }

        runPostFunctionCreateSteps(cachedFunc);
    }

    public shouldExecute(context: T): boolean {
        return !!context.functionTemplate;
    }

    private async _configureForDurableStorageIfNeeded(context: T): Promise<void> {
        if (!context.newDurableStorageType) {
            return;
        }

        try {
            const hostJsonPath: string = path.join(context.projectPath, hostFileName);
            const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath) as IHostJsonV2;
            hostJson.extensions ??= {};

            switch (context.newDurableStorageType) {
                case DurableBackend.Storage:
                    hostJson.extensions.durableTask = durableUtils.getDefaultStorageTaskConfig();
                    break;
                case DurableBackend.Netherite:
                    hostJson.extensions.durableTask = netheriteUtils.getDefaultNetheriteTaskConfig();
                    setLocalAppSetting(context, context.projectPath, 'EventHubsConnection', '', MismatchBehavior.Overwrite);
                    break;
                case DurableBackend.SQL:
                    hostJson.extensions.durableTask = sqlUtils.getDefaultSqlTaskConfig();
                    setLocalAppSetting(context, context.projectPath, 'SQLDB_Connection', '', MismatchBehavior.Overwrite);
                    break;
                default:
            }

            await AzExtFsExtra.writeJSON(hostJsonPath, hostJson);
        } catch {
            ext.outputChannel.appendLog(hostJsonConfigFailed);
        }
    }
}

function runPostFunctionCreateSteps(func: ICachedFunction): void {
    // Don't wait
    void callWithTelemetryAndErrorHandling('postFunctionCreate', async (context: IActionContext) => {
        context.telemetry.suppressIfSuccessful = true;

        // If function creation created a new file, open it in an editor...
        if (func.newFilePath && getContainingWorkspace(func.projectPath)) {
            if (await AzExtFsExtra.pathExists(func.newFilePath)) {
                await window.showTextDocument(await workspace.openTextDocument(Uri.file(func.newFilePath)));
            }
        }
    });
}
