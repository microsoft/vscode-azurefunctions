/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, nonNullProp } from "@microsoft/vscode-azext-utils";
import * as path from 'path';
import { Uri, window, workspace } from "vscode";
import { hostFileName, McpProjectType, mcpProjectTypeSetting, settingsFileName, vscodeFolderName } from "../../../constants";
import { ext } from "../../../extensionVariables";
import { type IHostJsonV2 } from "../../../funcConfig/host";
import { confirmEditJsonFile } from "../../../utils/fs";
import { isDocumentOpened } from "../../../utils/textUtils";
import { getWorkspaceSetting, updateWorkspaceSetting } from "../../../vsCodeConfig/settings";
import { type FunctionV2WizardContext } from "../IFunctionWizardContext";
import { getFileExtensionFromLanguage } from "../scriptSteps/ScriptFunctionCreateStep";
import { ActionSchemaStepBase } from "./ActionSchemaStepBase";

export class WriteToFileExecuteStep<T extends FunctionV2WizardContext> extends ActionSchemaStepBase<T> {
    public async executeAction(context: T): Promise<void> {
        context.newFilePath = await this.getFilePath(context);
        await this.writeToFile(context, context.newFilePath);
        if (!isDocumentOpened(Uri.file(context.newFilePath))) {
            await window.showTextDocument(await workspace.openTextDocument(Uri.file(context.newFilePath)));
        }
    }

    protected async writeToFile(context: T, filePath: string): Promise<void> {
        const sourceKey = nonNullProp(this.action, 'source');
        const source = context[sourceKey] as string;

        await AzExtFsExtra.writeFile(filePath, source);
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


            const hostFilePath: string = path.join(context.projectPath, hostFileName);
            if (await AzExtFsExtra.pathExists(hostFilePath)) {
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
    }

    protected async getFilePath(context: T): Promise<string> {
        // sometimes this has the file extension, sometimes it doesn't
        const filePathKey = nonNullProp(this.action, 'filePath').split('.')[0];
        const filePathValue: string | undefined = context[filePathKey] as string | undefined;

        if (!filePathValue) {
            throw new Error();
        }
        const fileExtension = getFileExtensionFromLanguage(context.language);
        const fullFilePath: string = path.join(context.projectPath, `${filePathValue}${fileExtension ?? ''}`);
        if (!await AzExtFsExtra.pathExists(fullFilePath)) {
            await AzExtFsExtra.ensureFile(fullFilePath);
        }

        return fullFilePath;
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
