/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStepWithActivityOutput, nonNullValue, withTelemetryStage } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type Progress } from 'vscode';
import { hostFileName, McpProjectType, mcpProjectTypeSetting, vscodeFolderName } from '../../constants';
import { type IHostJsonV2 } from '../../funcConfig/host';
import { localize } from '../../localize';
import { type FunctionTemplateBase } from '../../templates/IFunctionTemplate';
import { addLocalMcpServer, checkIfMcpServerExists, getLocalServerName, getOrCreateMcpJson, saveMcpJson } from '../../utils/mcpUtils';
import { telemetryUtils } from '../../utils/telemetryUtils';
import { verifyTemplateIsV1 } from '../../utils/templateVersionUtils';
import { verifyExtensionBundle } from '../../utils/verifyExtensionBundle';
import { getWorkspaceSetting, updateWorkspaceSetting, writeToSettingsJson } from '../../vsCodeConfig/settings';
import { type IFunctionWizardContext } from './IFunctionWizardContext';
import { openCreatedFunction } from './postFunctionCreate';

export { openCreatedFunction, runPostFunctionCreateStepsFromCache } from './postFunctionCreate';

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
        context.telemetry.properties.projectLanguage = telemetryUtils.getProjectLanguage(context.language);
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

        const cachedFunc = { projectPath: context.projectPath, newFilePath, isHttpTrigger: template.isHttpTrigger, isMcpTrigger: template.isMcpTrigger };
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
