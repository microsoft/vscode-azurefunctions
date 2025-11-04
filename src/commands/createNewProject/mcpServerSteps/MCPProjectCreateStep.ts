/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Progress } from "vscode";
import { azureWebJobsFeatureFlags, enableMcpCustomHandlerPreview, workerRuntimeKey } from "../../../constants";
import { type IHostJsonV2 } from "../../../funcConfig/host";
import { type MCPProjectWizardContext } from "../IProjectWizardContext";
import { ScriptProjectCreateStep } from "../ProjectCreateStep/ScriptProjectCreateStep";



export class MCPProjectCreateStep extends ScriptProjectCreateStep {
    public async executeCore(context: MCPProjectWizardContext, _progress: Progress<{ message?: string | undefined; increment?: number | undefined; }>): Promise<void> {
        this.localSettingsJson.Values = this.localSettingsJson.Values || {};
        this.localSettingsJson.Values[azureWebJobsFeatureFlags] = enableMcpCustomHandlerPreview;
        await super.executeCore(context, _progress);
        this.localSettingsJson.Values[workerRuntimeKey] = context.serverLanguage ?? 'custom';
        return;
    }

    protected async getHostContent(context: MCPProjectWizardContext): Promise<IHostJsonV2> {
        const hostJson: IHostJsonV2 = await super.getHostContent(context);
        hostJson.customHandler = {
            description: {
                defaultExecutablePath: '',
                workingDirectory: '',
                arguments: [""]
            }
        };
        hostJson.configurationProfile = "mcp-custom-handler";
        return hostJson;
    }
}
