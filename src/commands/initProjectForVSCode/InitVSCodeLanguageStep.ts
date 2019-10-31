/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem, QuickPickOptions } from 'vscode';
import { AzureWizardExecuteStep, AzureWizardPromptStep, IWizardOptions } from 'vscode-azureextensionui';
import { ProjectLanguage } from '../../constants';
import { ext } from '../../extensionVariables';
import { tryGetLocalFuncVersion } from '../../funcCoreTools/tryGetLocalFuncVersion';
import { FuncVersion, getGAVersionsForOS } from '../../FuncVersion';
import { localize } from '../../localize';
import { nonNullProp } from '../../utils/nonNull';
import { FuncVersionStep } from '../createNewProject/FuncVersionStep';
import { IProjectWizardContext } from '../createNewProject/IProjectWizardContext';
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

    public async prompt(context: IProjectWizardContext): Promise<void> {
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
            { label: ProjectLanguage.Python },
            { label: ProjectLanguage.TypeScript }
        ];

        const options: QuickPickOptions = { placeHolder: localize('selectLanguage', "Select your project's language") };
        context.language = <ProjectLanguage>(await ext.ui.showQuickPick(languagePicks, options)).label;
    }

    public shouldPrompt(context: IProjectWizardContext): boolean {
        return context.language === undefined;
    }

    public async getSubWizard(context: IProjectWizardContext): Promise<IWizardOptions<IProjectWizardContext>> {
        const language: ProjectLanguage = nonNullProp(context, 'language');
        const executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[] = [];
        const promptSteps: AzureWizardPromptStep<IProjectWizardContext>[] = [];

        await addInitVSCodeStep(context, executeSteps);
        if (language !== ProjectLanguage.CSharp && language !== ProjectLanguage.FSharp) { // version will be detected from proj file
            promptSteps.push(new FuncVersionStep());
        }

        return { promptSteps, executeSteps };
    }
}

export async function addInitVSCodeStep(context: IProjectWizardContext, executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[]): Promise<void> {
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
            executeSteps.push(new PythonInitVSCodeStep());
            break;
        case ProjectLanguage.PowerShell:
            executeSteps.push(new PowerShellInitVSCodeStep());
            break;
        case ProjectLanguage.Java:
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

    if (context.version === undefined) {
        context.version = await tryGetLocalFuncVersion();
        if (context.version === undefined) {
            // If only one GA version is supported on this OS, automatically use that
            const gaVersions: FuncVersion[] = getGAVersionsForOS();
            if (gaVersions.length === 1) {
                context.version = gaVersions[0];
            }
        }
    }
}
