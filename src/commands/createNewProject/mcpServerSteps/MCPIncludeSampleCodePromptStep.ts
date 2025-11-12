/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { type QuickPickOptions } from "vscode";
import { localize } from "../../../localize";
import { type MCPProjectWizardContext } from "../IProjectWizardContext";

export class MCPIncludeSampleCodePromptStep extends AzureWizardPromptStep<MCPProjectWizardContext> {
    public hideStepCount: boolean = true;

    public constructor() {
        super();
    }

    public shouldPrompt(wizardContext: MCPProjectWizardContext): boolean {
        return !wizardContext.includeSampleCode;
    }

    public async prompt(context: MCPProjectWizardContext): Promise<void> {
        const options: QuickPickOptions = { placeHolder: localize('includeSampleCode', 'Include sample server code') };
        const result = (await context.ui.showQuickPick(this.getPicks(), options)).data;
        context.includeSampleCode = result.includeSampleCode;
    }

    public getPicks(): IAzureQuickPickItem<{ includeSampleCode: boolean }>[] {
        return [
            { label: localize('yes', 'Yes'), description: localize('includeSampleCodeYesDescription', 'Starting from scratch'), data: { includeSampleCode: true } },
            { label: localize('no', 'No'), description: localize('includeSampleCodeNoDescription', 'Have an existing MCP server to host remotely'), data: { includeSampleCode: false } }
        ];
    }
}
