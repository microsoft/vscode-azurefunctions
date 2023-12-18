/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { ProjectLanguage } from "../../../constants";
import { IDockerfileProjectContext } from "./IDockerfileProjectContext";

export class DockerfileProjectLanguageStep extends AzureWizardPromptStep<IDockerfileProjectContext> {
    public async prompt(context: IDockerfileProjectContext): Promise<void> {
        const language: IAzureQuickPickItem<string>[] = [
            { label: ProjectLanguage.JavaScript, data: 'node' },
            { label: ProjectLanguage.TypeScript, data: 'typescript' },
            { label: ProjectLanguage.Python, data: 'python' },
            { label: ProjectLanguage.CSharp, data: 'csharp' },
            { label: ProjectLanguage.PowerShell, data: 'powershell' },
        ];

        context.dockerfileLanguage = (await context.ui.showQuickPick(language, { placeHolder: 'Select a language' })).data;
    }

    public shouldPrompt(context: IDockerfileProjectContext): boolean {
        return !context.dockerfileLanguage;
    }

}
