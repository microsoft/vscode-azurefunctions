/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStepWithActivityOutput, callWithTelemetryAndErrorHandling, nonNullValue, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { Uri, window, workspace, type Progress } from 'vscode';
import { hostFileName, McpProjectType, mcpProjectTypeSetting } from '../../constants';
import { ext } from '../../extensionVariables';
import { type IHostJsonV2 } from '../../funcConfig/host';
import { localize } from '../../localize';
import { type FunctionTemplateBase } from '../../templates/IFunctionTemplate';
import { verifyTemplateIsV1 } from '../../utils/templateVersionUtils';
import { verifyExtensionBundle } from '../../utils/verifyExtensionBundle';
import { getContainingWorkspace } from '../../utils/workspace';
import { updateWorkspaceSetting } from '../../vsCodeConfig/settings';
import { type IFunctionWizardContext } from './IFunctionWizardContext';

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

export abstract class FunctionCreateStepBase<T extends IFunctionWizardContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    public priority: number = 220;
    public stepName: string = 'FunctionCreateStepBase';
    public getTreeItemLabel(context: T): string {
        const template: FunctionTemplateBase = nonNullValue(context.functionTemplate);
        return localize('creatingFunction', 'Create new {0} "{1}"', template.name, context.functionName);
    }
    public getOutputLogSuccess(context: T): string {
        const template: FunctionTemplateBase = nonNullValue(context.functionTemplate);
        return localize('createdFunction', 'Successfully created new {0} "{1}".', template.name, context.functionName);
    }
    public getOutputLogFail(context: T): string {
        const template: FunctionTemplateBase = nonNullValue(context.functionTemplate);
        return localize('failedToCreateFunction', 'Failed to create new {0} "{1}".', template.name, context.functionName);
    }
    public getOutputLogProgress(context: T): string {
        const template: FunctionTemplateBase = nonNullValue(context.functionTemplate);
        return localize('creatingFunction', 'Creating new {0} "{1}"...', template.name, context.functionName);
    }
    /**
     * Returns the full path to the new function file
     */
    public abstract executeCore(context: T): Promise<string>;

    public async execute(context: T, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        const template: FunctionTemplateBase = nonNullValue(context.functionTemplate);
        context.telemetry.properties.projectLanguage = context.language;
        context.telemetry.properties.projectRuntime = context.version;
        context.telemetry.properties.templateId = template.id;

        progress.report({ message: localize('creatingFunction', 'Creating new {0}...', template.name) });

        const newFilePath: string = await this.executeCore(context);
        if (context.hasMcpTrigger) {
            // indicate that this is a MCP Extension Server project
            await updateWorkspaceSetting(mcpProjectTypeSetting, McpProjectType.McpExtensionServer, context.workspacePath);
        }

        await verifyExtensionBundle(context, template);

        const cachedFunc: ICachedFunction = { projectPath: context.projectPath, newFilePath, isHttpTrigger: template.isHttpTrigger };
        const hostFilePath: string = path.join(context.projectPath, hostFileName);
        if (await AzExtFsExtra.pathExists(hostFilePath)) {
            if (verifyTemplateIsV1(context.functionTemplate) && context.functionTemplate?.isDynamicConcurrent) {
                const hostJson = await AzExtFsExtra.readJSON<IHostJsonV2>(hostFilePath);
                hostJson.concurrency = {
                    dynamicConcurrencyEnabled: true,
                    snapshotPersistenceEnabled: true
                }
                await AzExtFsExtra.writeJSON(hostFilePath, hostJson);
            } else if (context.hasMcpTrigger) {
                const hostJson = await AzExtFsExtra.readJSON<IHostJsonV2>(hostFilePath);
                hostJson.extensions = hostJson.extensions ?? {};
                if (!hostJson.extensions.mcp) {
                    hostJson.extensions.mcp = {
                        instructions: "Some test instructions on how to use the server",
                        serverName: "TestServer",
                        serverVersion: "2.0.0",
                        encryptClientState: true,
                        messageOptions: {
                            useAbsoluteUriForEndpoint: false
                        },
                        system: {
                            webhookAuthorizationLevel: "System"
                        }
                    }
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
