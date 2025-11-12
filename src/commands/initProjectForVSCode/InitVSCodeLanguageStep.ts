/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type AzureWizardExecuteStep, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { type QuickPickOptions } from 'vscode';
import { ProjectLanguage, previewPythonModel } from '../../constants';
import { pythonNewModelPreview } from '../../constants-nls';
import { localize } from '../../localize';
import { type IProjectWizardContext } from '../createNewProject/IProjectWizardContext';
import { BallerinaInitVSCodeStep } from './InitVSCodeStep/BallerinaInitVSCodeStep';
import { DotnetInitVSCodeStep } from './InitVSCodeStep/DotnetInitVSCodeStep';
import { DotnetScriptInitVSCodeStep } from './InitVSCodeStep/DotnetScriptInitVSCodeStep';
import { JavaScriptInitVSCodeStep } from './InitVSCodeStep/JavaScriptInitVSCodeStep';
import { MCPServerInitVSCodeStep } from './InitVSCodeStep/MCPServerInitVSCodeStep';
import { PowerShellInitVSCodeStep } from './InitVSCodeStep/PowerShellInitVSCodeStep';
import { ScriptInitVSCodeStep } from './InitVSCodeStep/ScriptInitVSCodeStep';
import { TypeScriptInitVSCodeStep } from './InitVSCodeStep/TypeScriptInitVSCodeStep';
import { addJavaInitVSCodeSteps } from './javaSteps/addJavaInitVSCodeSteps';
import { addPythonInitVSCodeSteps } from './pythonSteps/addPythonInitVSCodeSteps';

export class InitVSCodeLanguageStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public hideStepCount: boolean = true;

    public async prompt(context: IProjectWizardContext): Promise<void> {
        // Display all languages, even if we don't have full support for them
        const languagePicks: IAzureQuickPickItem<{ language: ProjectLanguage, model?: number }>[] = [
            { label: ProjectLanguage.Ballerina, data: { language: ProjectLanguage.Ballerina } },
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
        case ProjectLanguage.Ballerina:
            executeSteps.push(new BallerinaInitVSCodeStep());
            break;
        case ProjectLanguage.SelfHostedMCPServer:
            executeSteps.push(new MCPServerInitVSCodeStep());
            break;
        default:
            executeSteps.push(new ScriptInitVSCodeStep());
            break;
    }
}
