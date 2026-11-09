/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStepWithActivityOutput, callWithTelemetryAndErrorHandling, initializeWorkflowTelemetry, nonNullValue, withTelemetryStage, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { Uri, window, workspace, type Progress } from 'vscode';
import { hostFileName, McpProjectType, mcpProjectTypeSetting, vscodeFolderName } from '../../constants';
import { ext } from '../../extensionVariables';
import { type IHostJsonV2 } from '../../funcConfig/host';
import { localize } from '../../localize';
import { type FunctionTemplateBase } from '../../templates/IFunctionTemplate';
import { addLocalMcpServer, checkIfMcpServerExists, getLocalServerName, getOrCreateMcpJson, saveMcpJson } from '../../utils/mcpUtils';
import { verifyTemplateIsV1 } from '../../utils/templateVersionUtils';
import { verifyExtensionBundle } from '../../utils/verifyExtensionBundle';
import { getContainingWorkspace } from '../../utils/workspace';
import { getWorkspaceSetting, updateWorkspaceSetting, writeToSettingsJson } from '../../vsCodeConfig/settings';
import { type IFunctionWizardContext } from './IFunctionWizardContext';

interface ICachedFunction {
    projectPath: string;
    newFilePath: string;
    isHttpTrigger: boolean;
    isMcpTrigger: boolean;
    workflowCorrelation?: ICachedWorkflowCorrelation;
}

interface ICachedWorkflowCorrelation {
    workflowRunId: string;
    parentAttemptId: string;
}

const cacheKey: string = 'azFuncPostFunctionCreate';

function isWorkflowCorrelation(value: unknown): value is ICachedWorkflowCorrelation {
    if (!value || typeof value !== 'object' || !('workflowRunId' in value) || !('parentAttemptId' in value)) {
        return false;
    }

    const generatedId = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
    return [value.workflowRunId, value.parentAttemptId].every(id =>
        typeof id === 'string' && id.length === 36 && generatedId.test(id));
}

export async function runPostFunctionCreateStepsFromCache(): Promise<void> {
    const cachedFunc: ICachedFunction | undefined = ext.context.globalState.get(cacheKey);
    if (cachedFunc) {
        try {
            await runPostFunctionCreateSteps(cachedFunc);
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

        const newFilePath = await withTelemetryStage(context, { stage: 'functionCreation' }, async () => this.executeCore(context));
        if (context.functionTemplate?.isMcpTrigger) {
            // indicate that this is a MCP Extension Server project
            context.mcpProjectType = McpProjectType.McpExtensionServer;
            if (context.workspaceFolder) {
                // can only update workspace setting if a workspaceFolder is opened
                const mcpProjectType = getWorkspaceSetting(mcpProjectTypeSetting, context.workspaceFolder);
                if (mcpProjectType !== McpProjectType.McpExtensionServer) {
                    await updateWorkspaceSetting(mcpProjectTypeSetting, McpProjectType.McpExtensionServer, context.workspacePath);
                }
            } else {
                // otherwise write to settings.json in .vscode
                await writeToSettingsJson(context, path.join(context.projectPath, vscodeFolderName), mcpProjectTypeSetting, McpProjectType.McpExtensionServer);
            }
            // add the local server to the mcp.json if it doesn't already exist
            const mcpJson = await getOrCreateMcpJson(context.projectPath);
            const serverName = getLocalServerName(context.projectPath);
            // only add if it doesn't already exist
            if (!checkIfMcpServerExists(mcpJson, serverName)) {
                const newMcpJson = await addLocalMcpServer(mcpJson, serverName, McpProjectType.McpExtensionServer);
                await saveMcpJson(context.projectPath, newMcpJson);
            }
        }

        await verifyExtensionBundle(context, template);

        const cachedFunc: ICachedFunction = { projectPath: context.projectPath, newFilePath, isHttpTrigger: template.isHttpTrigger, isMcpTrigger: template.isMcpTrigger };
        const hostFilePath: string = path.join(context.projectPath, hostFileName);
        if (await AzExtFsExtra.pathExists(hostFilePath)) {
            if (verifyTemplateIsV1(context.functionTemplate) && context.functionTemplate?.isDynamicConcurrent) {
                const hostJson = await AzExtFsExtra.readJSON<IHostJsonV2>(hostFilePath);
                hostJson.concurrency = {
                    dynamicConcurrencyEnabled: true,
                    snapshotPersistenceEnabled: true
                };
                await AzExtFsExtra.writeJSON(hostFilePath, hostJson);
            } else if (context.functionTemplate?.isMcpTrigger) {
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
                    };
                }
                await AzExtFsExtra.writeJSON(hostFilePath, hostJson);
            }
        }

        await openCreatedFunction(cachedFunc, !!context.openBehavior, context);
    }

    public shouldExecute(context: T): boolean {
        return !!context.functionTemplate;
    }
}

export async function openCreatedFunction(func: ICachedFunction, cache: boolean, parentContext?: IActionContext): Promise<void> {
    if (parentContext?.telemetry.properties.workflowRunId) {
        const workflowCorrelation = {
            workflowRunId: parentContext.telemetry.properties.workflowRunId,
            parentAttemptId: parentContext.telemetry.properties.attemptId,
        };
        if (isWorkflowCorrelation(workflowCorrelation)) {
            func.workflowCorrelation = workflowCorrelation;
        }
    }

    if (cache) {
        // OpenFolderStep can restart the extension host, so activation opens the cached file.
        const globalState = ext.context.globalState;
        await globalState.update(cacheKey, func);
        setTimeout(() => { void globalState.update(cacheKey, undefined); }, 5 * 1000);
    }

    await runPostFunctionCreateSteps(func, parentContext);
}

async function runPostFunctionCreateSteps(func: ICachedFunction, parentContext?: IActionContext): Promise<void> {
    await callWithTelemetryAndErrorHandling('postFunctionCreate', async (context: IActionContext) => {
        if (parentContext?.telemetry.properties.workflowRunId) {
            initializeWorkflowTelemetry(context, { workflow: 'createProject', command: 'unknown' }, parentContext);
            context.valuesToMask.push(...parentContext.valuesToMask);
        } else if (isWorkflowCorrelation(func.workflowCorrelation)) {
            // Restart replay links diagnostics only; the original workflow's outcome and timing cannot be resumed.
            context.telemetry.properties.workflowRunId = func.workflowCorrelation.workflowRunId;
            context.telemetry.properties.parentAttemptId = func.workflowCorrelation.parentAttemptId;
            context.telemetry.properties.isWorkflowRoot = 'false';
        }
        context.telemetry.suppressIfSuccessful = true;

        // If function creation created a new file, open it in an editor...
        if (func.newFilePath && getContainingWorkspace(func.projectPath)) {
            const mcpJsonFilePath: string = path.join(func.projectPath, '.vscode', 'mcp.json');
            if (await AzExtFsExtra.pathExists(func.newFilePath) && await AzExtFsExtra.pathExists(mcpJsonFilePath) && func.isMcpTrigger) {
                // show the func new file path and the mcp json file in a split editor
                const templateFile = await workspace.openTextDocument(Uri.file(func.newFilePath));
                const mcpJsonFile = await workspace.openTextDocument(Uri.file(mcpJsonFilePath));
                await window.showTextDocument(templateFile, { viewColumn: 1, preserveFocus: false });
                await window.showTextDocument(mcpJsonFile, { viewColumn: 2, preserveFocus: true });
            }
            else if (await AzExtFsExtra.pathExists(func.newFilePath)) {
                await window.showTextDocument(await workspace.openTextDocument(Uri.file(func.newFilePath)));
            }
        }
    });
}
