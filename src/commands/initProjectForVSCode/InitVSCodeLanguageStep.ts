/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem, QuickPickOptions } from 'vscode';
import { AzureWizardExecuteStep, AzureWizardPromptStep, IWizardOptions } from 'vscode-azureextensionui';
import { ProjectLanguage } from '../../constants';
import { localize } from '../../localize';
import { IProjectWizardContext } from '../createNewProject/IProjectWizardContext';
import { DotnetInitVSCodeStep } from './InitVSCodeStep/DotnetInitVSCodeStep';
import { DotnetScriptInitVSCodeStep } from './InitVSCodeStep/DotnetScriptInitVSCodeStep';
import { JavaScriptInitVSCodeStep } from './InitVSCodeStep/JavaScriptInitVSCodeStep';
import { PowerShellInitVSCodeStep } from './InitVSCodeStep/PowerShellInitVSCodeStep';
import { ScriptInitVSCodeStep } from './InitVSCodeStep/ScriptInitVSCodeStep';
import { TypeScriptInitVSCodeStep } from './InitVSCodeStep/TypeScriptInitVSCodeStep';
import { addJavaInitVSCodeSteps } from './javaSteps/addJavaInitVSCodeSteps';
import { addPythonInitVSCodeSteps } from './pythonSteps/addPythonInitVSCodeSteps';

export class InitVSCodeLanguageStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public hideStepCount: boolean = true;

    public async prompt(context: IProjectWizardContext): Promise<void> {
        // Display all languages, even if we don't have full support for them
        const languagePicks: QuickPickItem[] = [
            { label: ProjectLanguage.CSharp },
            { label: ProjectLanguage.CSharpScript },
            { label: ProjectLanguage.FSharp },
            { label: ProjectLanguage.FSharpScript },
            { label: ProjectLanguage.Java },
            { label: ProjectLanguage.JavaScript },
            { label: ProjectLanguage.PowerShell },
            { label: ProjectLanguage.Python },
            { label: ProjectLanguage.TypeScript },
            { label: ProjectLanguage.Custom }
        ];

        const options: QuickPickOptions = { placeHolder: localize('selectLanguage', "Select your project's language") };
        context.language = <ProjectLanguage>(await context.ui.showQuickPick(languagePicks, options)).label;
    }

    public shouldPrompt(context: IProjectWizardContext): boolean {
        return context.language === undefined;
    }

    public async getSubWizard(context: IProjectWizardContext): Promise<IWizardOptions<IProjectWizardContext>> {
        const executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[] = [];
        const promptSteps: AzureWizardPromptStep<IProjectWizardContext>[] = [];
        await addInitVSCodeSteps(context, promptSteps, executeSteps);
        return { promptSteps, executeSteps };
    }
}

export async function addInitVSCodeSteps(
    context: IProjectWizardContext,
    promptSteps: AzureWizardPromptStep<IProjectWizardContext>[],
    executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[]): Promise<void> {

    switch (context.language) {
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
            await addPythonInitVSCodeSteps(context, promptSteps, executeSteps);
            break;
        case ProjectLanguage.PowerShell:
            executeSteps.push(new PowerShellInitVSCodeStep());
            break;
        case ProjectLanguage.Java:
            await addJavaInitVSCodeSteps(context, promptSteps, executeSteps);
            break;
        case ProjectLanguage.CSharpScript:
        case ProjectLanguage.FSharpScript:
            executeSteps.push(new DotnetScriptInitVSCodeStep());
            break;
        default:
            executeSteps.push(new ScriptInitVSCodeStep());
            break;
    }
}
