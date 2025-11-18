/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStepWithActivityOutput, callWithTelemetryAndErrorHandling, nonNullValue, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { Uri, window, workspace, type Progress } from 'vscode';
import { hostFileName, McpProjectType, mcpProjectTypeSetting, settingsFileName, vscodeFolderName } from '../../constants';
import { ext } from '../../extensionVariables';
import { type IHostJsonV2 } from '../../funcConfig/host';
import { localize } from '../../localize';
import { type FunctionTemplateBase } from '../../templates/IFunctionTemplate';
import { confirmEditJsonFile } from '../../utils/fs';
import { addLocalMcpServer, checkIfMcpServerExists, getLocalServerName, getOrCreateMcpJson, saveMcpJson } from '../../utils/mcpUtils';
import { verifyTemplateIsV1 } from '../../utils/templateVersionUtils';
import { verifyExtensionBundle } from '../../utils/verifyExtensionBundle';
import { getContainingWorkspace } from '../../utils/workspace';
import { getWorkspaceSetting, updateWorkspaceSetting } from '../../vsCodeConfig/settings';
import { type IFunctionWizardContext } from './IFunctionWizardContext';

interface ICachedFunction {
    projectPath: string;
    newFilePath: string;
    isHttpTrigger: boolean;
    isMcpTrigger: boolean;
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
                await this.writeToSettingsJson(context, path.join(context.projectPath, vscodeFolderName));
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
                }
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

    private async writeToSettingsJson(context: T, vscodePath: string): Promise<void> {
        const settingsJsonPath: string = path.join(vscodePath, settingsFileName);
        const settings = [{ key: mcpProjectTypeSetting, value: context.mcpProjectType }];
        await confirmEditJsonFile(
            context,
            settingsJsonPath,
            (data: {}): {} => {
                for (const setting of settings) {
                    const key: string = `${ext.prefix}.${setting.key}`;
                    data[key] = setting.value;
                }
                return data;
            }
        );
    }
}

function runPostFunctionCreateSteps(func: ICachedFunction): void {
    // Don't wait
    void callWithTelemetryAndErrorHandling('postFunctionCreate', async (context: IActionContext) => {
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
