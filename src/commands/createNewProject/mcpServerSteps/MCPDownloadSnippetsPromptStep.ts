/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { type QuickPickOptions } from "vscode";
import { localize } from "../../../localize";
import { type MCPProjectWizardContext } from "../IProjectWizardContext";

export class MCPDownloadSnippetsPromptStep extends AzureWizardPromptStep<MCPProjectWizardContext> {
    public hideStepCount: boolean = true;

    public constructor() {
        super();
    }

    public shouldPrompt(wizardContext: MCPProjectWizardContext): boolean {
        return !wizardContext.includeSnippets;
    }

    public async prompt(context: MCPProjectWizardContext): Promise<void> {
        const options: QuickPickOptions = { placeHolder: localize('includeSampleCode', 'Include sample server code?') };
        const result = (await context.ui.showQuickPick(this.getPicks(), options)).data;
        context.includeSnippets = result.includeSnippets;
    }

    public getPicks(): IAzureQuickPickItem<{ includeSnippets: boolean }>[] {
        return [
            { label: localize('yes', 'Yes'), description: localize('includeSnippetsYesDescription', 'Recommended if starting from scratch'), data: { includeSnippets: true } },
            { label: localize('no', 'No'), description: localize('includeSnippetsNoDescription', 'If you have an existing MCP server to host remotely'), data: { includeSnippets: false } }
        ];
    }
}
