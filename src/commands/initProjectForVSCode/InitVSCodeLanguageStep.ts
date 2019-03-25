/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem, QuickPickOptions } from 'vscode';
import { AzureWizardExecuteStep, AzureWizardPromptStep, IWizardOptions } from 'vscode-azureextensionui';
import { ProjectLanguage, ProjectRuntime } from '../../constants';
import { ext } from '../../extensionVariables';
import { tryGetLocalRuntimeVersion } from '../../funcCoreTools/tryGetLocalRuntimeVersion';
import { localize } from '../../localize';
import { nonNullProp } from '../../utils/nonNull';
import { IProjectWizardContext } from '../createNewProject/IProjectWizardContext';
import { ProjectRuntimeStep } from '../createNewProject/ProjectRuntimeStep';
import { DotnetInitVSCodeStep } from './InitVSCodeStep/DotnetInitVSCodeStep';
import { DotnetScriptInitVSCodeStep } from './InitVSCodeStep/DotnetScriptInitVSCodeStep';
import { JavaInitVSCodeStep } from './InitVSCodeStep/JavaInitVSCodeStep';
import { JavaScriptInitVSCodeStep } from './InitVSCodeStep/JavaScriptInitVSCodeStep';
import { PowerShellInitVSCodeStep } from './InitVSCodeStep/PowerShellInitVSCodeStep';
import { PythonInitVSCodeStep } from './InitVSCodeStep/PythonInitVSCodeStep';
import { ScriptInitVSCodeStep } from './InitVSCodeStep/ScriptInitVSCodeStep';
import { TypeScriptInitVSCodeStep } from './InitVSCodeStep/TypeScriptInitVSCodeStep';

export class InitVSCodeLanguageStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public hideStepCount: boolean = true;

    public async prompt(wizardContext: IProjectWizardContext): Promise<void> {
        const previewDescription: string = localize('previewDescription', '(Preview)');
        // Display all languages, even if we don't have full support for them
        const languagePicks: QuickPickItem[] = [
            { label: ProjectLanguage.Bash, description: previewDescription },
            { label: ProjectLanguage.Batch, description: previewDescription },
            { label: ProjectLanguage.CSharp },
            { label: ProjectLanguage.CSharpScript },
            { label: ProjectLanguage.FSharp },
            { label: ProjectLanguage.FSharpScript },
            { label: ProjectLanguage.Java },
            { label: ProjectLanguage.JavaScript },
            { label: ProjectLanguage.PHP, description: previewDescription },
            { label: ProjectLanguage.PowerShell, description: previewDescription },
            { label: ProjectLanguage.Python, description: previewDescription },
            { label: ProjectLanguage.TypeScript }
        ];

        const options: QuickPickOptions = { placeHolder: localize('selectLanguage', "Select your project's language") };
        wizardContext.language = <ProjectLanguage>(await ext.ui.showQuickPick(languagePicks, options)).label;
    }

    public shouldPrompt(wizardContext: IProjectWizardContext): boolean {
        return wizardContext.language === undefined;
    }

    public async getSubWizard(wizardContext: IProjectWizardContext): Promise<IWizardOptions<IProjectWizardContext>> {
        const language: ProjectLanguage = nonNullProp(wizardContext, 'language');
        const executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[] = [];
        const promptSteps: AzureWizardPromptStep<IProjectWizardContext>[] = [];

        await addInitVSCodeStep(wizardContext, executeSteps);
        if (language !== ProjectLanguage.CSharp && language !== ProjectLanguage.FSharp) { // runtime will be detected from proj file
            promptSteps.push(new ProjectRuntimeStep());
        }

        return { promptSteps, executeSteps };
    }
}

export async function addInitVSCodeStep(wizardContext: IProjectWizardContext, executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[]): Promise<void> {
    switch (wizardContext.language) {
        case ProjectLanguage.JavaScript:
            executeSteps.push(new JavaScriptInitVSCodeStep());
            break;
        case ProjectLanguage.TypeScript:
            executeSteps.push(new TypeScriptInitVSCodeStep());
            break;
        case ProjectLanguage.CSharp:
        case ProjectLanguage.FSharp:
            executeSteps.push(new DotnetInitVSCodeStep());
            break;
        case ProjectLanguage.Python:
            wizardContext.runtime = ProjectRuntime.v2; // only supports v2
            executeSteps.push(new PythonInitVSCodeStep());
            break;
        case ProjectLanguage.PowerShell:
            executeSteps.push(new PowerShellInitVSCodeStep());
            break;
        case ProjectLanguage.Java:
            wizardContext.runtime = ProjectRuntime.v2; // only supports v2
            executeSteps.push(new JavaInitVSCodeStep());
            break;
        case ProjectLanguage.CSharpScript:
        case ProjectLanguage.FSharpScript:
            executeSteps.push(new DotnetScriptInitVSCodeStep());
            break;
        default:
            executeSteps.push(new ScriptInitVSCodeStep());
            break;
    }

    if (wizardContext.runtime === undefined) {
        wizardContext.runtime = await tryGetLocalRuntimeVersion();
    }
}
