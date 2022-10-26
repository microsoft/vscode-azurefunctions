/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, AzureWizardPromptStep, IAzureQuickPickItem, IWizardOptions } from '@microsoft/vscode-azext-utils';
import { QuickPickOptions } from 'vscode';
import { previewPythonModel, ProjectLanguage, pysteinModelSetting } from '../../constants';
import { localize, pythonNewModelPreview } from '../../localize';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
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
        let languagePicks: IAzureQuickPickItem<{ language: ProjectLanguage, model?: number }>[] = [
            { label: ProjectLanguage.CSharp, data: { language: ProjectLanguage.CSharp } },
            { label: ProjectLanguage.CSharpScript, data: { language: ProjectLanguage.CSharpScript } },
            { label: ProjectLanguage.FSharp, data: { language: ProjectLanguage.FSharp } },
            { label: ProjectLanguage.FSharpScript, data: { language: ProjectLanguage.FSharpScript } },
            { label: ProjectLanguage.Java, data: { language: ProjectLanguage.Java } },
            { label: ProjectLanguage.JavaScript, data: { language: ProjectLanguage.JavaScript } },
            { label: ProjectLanguage.PowerShell, data: { language: ProjectLanguage.PowerShell } },
            { label: ProjectLanguage.Python, data: { language: ProjectLanguage.Python } },
            { label: pythonNewModelPreview, data: { language: ProjectLanguage.Python, model: previewPythonModel } },
            { label: ProjectLanguage.TypeScript, data: { language: ProjectLanguage.TypeScript } },
            { label: ProjectLanguage.Custom, data: { language: ProjectLanguage.Custom } }
        ];

        if (!getWorkspaceSetting(pysteinModelSetting)) {
            languagePicks = languagePicks.filter(p => {
                return p.label !== pythonNewModelPreview;
            })
        }

        const options: QuickPickOptions = { placeHolder: localize('selectLanguage', "Select your project's language") };
        const option = await context.ui.showQuickPick(languagePicks, options);
        context.language = option.data.language;
        context.languageModel = option.data.model;
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
