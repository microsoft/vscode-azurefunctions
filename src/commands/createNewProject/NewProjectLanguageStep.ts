/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickOptions } from 'vscode';
import { AzureWizardExecuteStep, AzureWizardPromptStep, IAzureQuickPickItem, IWizardOptions, UserCancelledError } from 'vscode-azureextensionui';
import { ProjectLanguage } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { nonNullProp } from '../../utils/nonNull';
import { openUrl } from '../../utils/openUrl';
import { FunctionListStep } from '../createFunction/FunctionListStep';
import { addInitVSCodeStep } from '../initProjectForVSCode/InitVSCodeLanguageStep';
import { IProjectWizardContext } from './IProjectWizardContext';
import { JavaAppNameStep } from './javaSteps/JavaAppNameStep';
import { JavaArtifactIdStep } from './javaSteps/JavaArtifactIdStep';
import { JavaGroupIdStep } from './javaSteps/JavaGroupIdStep';
import { JavaPackageNameStep } from './javaSteps/JavaPackageNameStep';
import { JavaVersionStep } from './javaSteps/JavaVersionStep';
import { DotnetProjectCreateStep } from './ProjectCreateStep/DotnetProjectCreateStep';
import { JavaProjectCreateStep } from './ProjectCreateStep/JavaProjectCreateStep';
import { JavaScriptProjectCreateStep } from './ProjectCreateStep/JavaScriptProjectCreateStep';
import { PowerShellProjectCreateStep } from './ProjectCreateStep/PowerShellProjectCreateStep';
import { PythonProjectCreateStep } from './ProjectCreateStep/PythonProjectCreateStep';
import { ScriptProjectCreateStep } from './ProjectCreateStep/ScriptProjectCreateStep';
import { TypeScriptProjectCreateStep } from './ProjectCreateStep/TypeScriptProjectCreateStep';
import { ProjectRuntimeStep } from './ProjectRuntimeStep';

export class NewProjectLanguageStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public hideStepCount: boolean = true;

    private _templateId?: string;
    private _triggerSettings?: { [key: string]: string | undefined };

    public constructor(templateId: string | undefined, triggerSettings: { [key: string]: string | undefined } | undefined) {
        super();
        this._templateId = templateId;
        this._triggerSettings = triggerSettings;
    }

    public async prompt(wizardContext: IProjectWizardContext): Promise<void> {
        const previewDescription: string = localize('previewDescription', '(Preview)');
        // Only display 'supported' languages that can be debugged in VS Code
        const languagePicks: IAzureQuickPickItem<ProjectLanguage | undefined>[] = [
            { label: ProjectLanguage.JavaScript, data: ProjectLanguage.JavaScript },
            { label: ProjectLanguage.TypeScript, data: ProjectLanguage.TypeScript },
            { label: ProjectLanguage.CSharp, data: ProjectLanguage.CSharp },
            { label: ProjectLanguage.Python, description: previewDescription, data: ProjectLanguage.Python },
            { label: ProjectLanguage.Java, data: ProjectLanguage.Java },
            { label: ProjectLanguage.PowerShell, description: previewDescription, data: ProjectLanguage.PowerShell }
        ];

        languagePicks.push({ label: localize('viewSamples', '$(link-external) View sample projects'), data: undefined, suppressPersistence: true });

        const options: QuickPickOptions = { placeHolder: localize('selectFuncTemplate', 'Select a language for your function project') };
        const result: ProjectLanguage | undefined = (await ext.ui.showQuickPick(languagePicks, options)).data;
        if (result === undefined) {
            await openUrl('https://aka.ms/AA4ul9b');
            wizardContext.actionContext.properties.cancelStep = 'viewSampleProjects';
            throw new UserCancelledError();
        } else {
            wizardContext.language = result;
        }
    }

    public shouldPrompt(wizardContext: IProjectWizardContext): boolean {
        return wizardContext.language === undefined;
    }

    public async getSubWizard(wizardContext: IProjectWizardContext): Promise<IWizardOptions<IProjectWizardContext>> {
        const language: ProjectLanguage = nonNullProp(wizardContext, 'language');
        const executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[] = [];

        const promptSteps: AzureWizardPromptStep<IProjectWizardContext>[] = [new ProjectRuntimeStep()];
        switch (language) {
            case ProjectLanguage.JavaScript:
                executeSteps.push(new JavaScriptProjectCreateStep());
                break;
            case ProjectLanguage.TypeScript:
                executeSteps.push(new TypeScriptProjectCreateStep());
                break;
            case ProjectLanguage.CSharp:
            case ProjectLanguage.FSharp:
                executeSteps.push(await DotnetProjectCreateStep.createStep(wizardContext.actionContext));
                break;
            case ProjectLanguage.Python:
                executeSteps.push(new PythonProjectCreateStep());
                break;
            case ProjectLanguage.PowerShell:
                executeSteps.push(new PowerShellProjectCreateStep());
                break;
            case ProjectLanguage.Java:
                promptSteps.push(new JavaGroupIdStep(), new JavaArtifactIdStep(), new JavaVersionStep(), new JavaPackageNameStep(), new JavaAppNameStep());
                executeSteps.push(await JavaProjectCreateStep.createStep(wizardContext.actionContext));
                break;
            default:
                executeSteps.push(new ScriptProjectCreateStep());
                break;
        }

        await addInitVSCodeStep(wizardContext, executeSteps);

        const wizardOptions: IWizardOptions<IProjectWizardContext> = { promptSteps, executeSteps };

        // All languages except Java support creating a function after creating a project
        // Java needs to fix this issue first: https://github.com/Microsoft/vscode-azurefunctions/issues/81
        if (language !== ProjectLanguage.Java) {
            promptSteps.push(await FunctionListStep.create(wizardContext, {
                isProjectWizard: true,
                templateId: this._templateId,
                triggerSettings: this._triggerSettings
            }));
        }

        return wizardOptions;
    }
}
