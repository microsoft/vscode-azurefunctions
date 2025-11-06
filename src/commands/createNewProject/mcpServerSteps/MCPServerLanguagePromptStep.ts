/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { type QuickPickOptions } from "vscode";
import { ProjectLanguage } from "../../../constants";
import { localize } from "../../../localize";
import { type MCPProjectWizardContext } from "../IProjectWizardContext";

export class MCPServerLanguagePromptStep extends AzureWizardPromptStep<MCPProjectWizardContext> {
    public hideStepCount: boolean = true;

    public constructor() {
        super();
    }

    public shouldPrompt(wizardContext: MCPProjectWizardContext): boolean {
        return !wizardContext.serverLanguage;
    }

    public async prompt(context: MCPProjectWizardContext): Promise<void> {
        // Only display 'supported' languages that can be debugged in VS Code
        const options: QuickPickOptions = { placeHolder: localize('selectServerLanguage', 'Select a language for the MCP server') };
        const result = (await context.ui.showQuickPick(this.getPicks(), options)).data;
        context.serverLanguage = result.language;
    }

    public getPicks(): IAzureQuickPickItem<{ language: ProjectLanguage }>[] {
        return [
            { label: ProjectLanguage.Python, data: { language: ProjectLanguage.Python } },
            { label: ProjectLanguage.TypeScript, data: { language: ProjectLanguage.TypeScript } },
            { label: ProjectLanguage.CSharp, data: { language: ProjectLanguage.CSharp } },
        ];
    }
}
