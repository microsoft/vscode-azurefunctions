/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Progress } from "vscode";
import { azureWebJobsFeatureFlags, enableMcpCustomHandlerPreview, ProjectLanguage, workerRuntimeKey } from "../../../constants";
import { type IHostJsonV2 } from "../../../funcConfig/host";
import { type MCPProjectWizardContext } from "../IProjectWizardContext";
import { ScriptProjectCreateStep } from "../ProjectCreateStep/ScriptProjectCreateStep";



export class MCPProjectCreateStep extends ScriptProjectCreateStep {
    public async executeCore(context: MCPProjectWizardContext, _progress: Progress<{ message?: string | undefined; increment?: number | undefined; }>): Promise<void> {
        this.localSettingsJson.Values = this.localSettingsJson.Values || {};
        this.localSettingsJson.Values[azureWebJobsFeatureFlags] = enableMcpCustomHandlerPreview;
        // TODO: need to fix this to be plain strings: "python", "node", "dotnet-isolated"
        this.localSettingsJson.Values[workerRuntimeKey] = context.serverLanguage ?? 'custom'
        // TODO: We may need to create the mcp.json like this, unclear atm
        /* {
        "servers": {
            "local-mcp-server": {
                "type": "http",
                "url": "http://localhost:7071/mcp"
            },
            "remote-mcp-server": {
                "type": "http",
                "url": "https://${input:functionapp-domain}/mcp",
            }
        },
        "inputs": [
            {
                "type": "promptString",
                "id": "functionapp-domain",
                "description": "The domain of the function app."
            }
        ]
    } */
        await super.executeCore(context, _progress);
        return;
    }

    protected async getHostContent(context: MCPProjectWizardContext): Promise<IHostJsonV2> {
        const hostJson: IHostJsonV2 = await super.getHostContent(context);
        let defaultExecutablePath: string = '';
        const args: string[] = [];
        // only set these for the users if they chose to include sample code that will match these parameters
        if (context.includeSampleCode) {
            switch (context.serverLanguage) {
                case ProjectLanguage.Python:
                    defaultExecutablePath = 'python';
                    args.push('server.py');
                    break;
                case ProjectLanguage.TypeScript:
                    defaultExecutablePath = 'npm';
                    args.push('run', 'start');
                    break;
                case ProjectLanguage.CSharp:
                    defaultExecutablePath = 'dotnet';
                    args.push('server.dll');
                    break;
                default:
                    break;
            }
        }
        hostJson.customHandler = {
            description: {
                defaultExecutablePath,
                workingDirectory: '',
                arguments: args
            }
        };
        hostJson.configurationProfile = "mcp-custom-handler";
        return hostJson;
    }
}
