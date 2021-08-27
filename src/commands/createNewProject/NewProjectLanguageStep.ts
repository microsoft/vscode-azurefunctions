/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickOptions } from 'vscode';
import { AzureWizardExecuteStep, AzureWizardPromptStep, IAzureQuickPickItem, IWizardOptions, UserCancelledError } from 'vscode-azureextensionui';
import { ProjectLanguage } from '../../constants';
import { localize } from '../../localize';
import { nonNullProp } from '../../utils/nonNull';
import { openUrl } from '../../utils/openUrl';
import { FunctionListStep } from '../createFunction/FunctionListStep';
import { addInitVSCodeSteps } from '../initProjectForVSCode/InitVSCodeLanguageStep';
import { DotnetRuntimeStep } from './dotnetSteps/DotnetRuntimeStep';
import { IProjectWizardContext } from './IProjectWizardContext';
import { JavaAppNameStep } from './javaSteps/JavaAppNameStep';
import { JavaArtifactIdStep } from './javaSteps/JavaArtifactIdStep';
import { JavaBuildToolStep } from './javaSteps/JavaBuildToolStep';
import { JavaGroupIdStep } from './javaSteps/JavaGroupIdStep';
import { JavaPackageNameStep } from './javaSteps/JavaPackageNameStep';
import { JavaProjectVersionStep } from './javaSteps/JavaProjectVersionStep';
import { JavaVersionStep } from './javaSteps/JavaVersionStep';
import { CustomProjectCreateStep } from './ProjectCreateStep/CustomProjectCreateStep';
import { DotnetProjectCreateStep } from './ProjectCreateStep/DotnetProjectCreateStep';
import { JavaProjectCreateStep } from './ProjectCreateStep/JavaProjectCreateStep';
import { JavaScriptProjectCreateStep } from './ProjectCreateStep/JavaScriptProjectCreateStep';
import { PowerShellProjectCreateStep } from './ProjectCreateStep/PowerShellProjectCreateStep';
import { PythonProjectCreateStep } from './ProjectCreateStep/PythonProjectCreateStep';
import { ScriptProjectCreateStep } from './ProjectCreateStep/ScriptProjectCreateStep';
import { TypeScriptProjectCreateStep } from './ProjectCreateStep/TypeScriptProjectCreateStep';

export class NewProjectLanguageStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public hideStepCount: boolean = true;

    private readonly _templateId?: string;
    private readonly _functionSettings?: { [key: string]: string | undefined };

    public constructor(templateId: string | undefined, functionSettings: { [key: string]: string | undefined } | undefined) {
        super();
        this._templateId = templateId;
        this._functionSettings = functionSettings;
    }

    public async prompt(context: IProjectWizardContext): Promise<void> {
        // Only display 'supported' languages that can be debugged in VS Code
        let languagePicks: IAzureQuickPickItem<ProjectLanguage | undefined>[] = [
            { label: ProjectLanguage.JavaScript, data: ProjectLanguage.JavaScript },
            { label: ProjectLanguage.TypeScript, data: ProjectLanguage.TypeScript },
            { label: ProjectLanguage.CSharp, data: ProjectLanguage.CSharp },
            { label: ProjectLanguage.Python, data: ProjectLanguage.Python },
            { label: ProjectLanguage.Java, data: ProjectLanguage.Java },
            { label: ProjectLanguage.PowerShell, data: ProjectLanguage.PowerShell },
            { label: localize('customHandler', 'Custom Handler'), data: ProjectLanguage.Custom }
        ];

        languagePicks.push({ label: localize('viewSamples', '$(link-external) View sample projects'), data: undefined, suppressPersistence: true });

        if (context.languageFilter) {
            languagePicks = languagePicks.filter(p => {
                return p.data !== undefined && context.languageFilter?.test(p.data);
            });
        }

        const options: QuickPickOptions = { placeHolder: localize('selectLanguage', 'Select a language') };
        const result: ProjectLanguage | undefined = (await context.ui.showQuickPick(languagePicks, options)).data;
        if (result === undefined) {
            await openUrl('https://aka.ms/AA4ul9b');
            throw new UserCancelledError('viewSampleProjects');
        } else {
            context.language = result;
        }
    }

    public shouldPrompt(context: IProjectWizardContext): boolean {
        return context.language === undefined;
    }

    public async getSubWizard(context: IProjectWizardContext): Promise<IWizardOptions<IProjectWizardContext>> {
        const language: ProjectLanguage = nonNullProp(context, 'language');
        const executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[] = [];

        const promptSteps: AzureWizardPromptStep<IProjectWizardContext>[] = [];
        switch (language) {
            case ProjectLanguage.JavaScript:
                executeSteps.push(new JavaScriptProjectCreateStep());
                break;
            case ProjectLanguage.TypeScript:
                executeSteps.push(new TypeScriptProjectCreateStep());
                break;
            case ProjectLanguage.CSharp:
            case ProjectLanguage.FSharp:
                promptSteps.push(await DotnetRuntimeStep.createStep(context));
                executeSteps.push(await DotnetProjectCreateStep.createStep(context));
                break;
            case ProjectLanguage.Python:
                executeSteps.push(new PythonProjectCreateStep());
                break;
            case ProjectLanguage.PowerShell:
                executeSteps.push(new PowerShellProjectCreateStep());
                break;
            case ProjectLanguage.Java:
                await JavaVersionStep.setDefaultVersion(context);
                await JavaBuildToolStep.setDefaultBuildTool(context); // Set build tool to maven as other Java project with other build tool is not supported now
                promptSteps.push(new JavaVersionStep(), new JavaGroupIdStep(), new JavaArtifactIdStep(), new JavaProjectVersionStep(), new JavaPackageNameStep(), new JavaAppNameStep());
                executeSteps.push(await JavaProjectCreateStep.createStep(context));
                break;
            case ProjectLanguage.Custom:
                executeSteps.push(new CustomProjectCreateStep());
                break;
            default:
                executeSteps.push(new ScriptProjectCreateStep());
                break;
        }

        await addInitVSCodeSteps(context, promptSteps, executeSteps);

        const wizardOptions: IWizardOptions<IProjectWizardContext> = { promptSteps, executeSteps };

        // All languages except Java support creating a function after creating a project
        // Java needs to fix this issue first: https://github.com/Microsoft/vscode-azurefunctions/issues/81
        if (language !== ProjectLanguage.Java) {
            promptSteps.push(await FunctionListStep.create(context, {
                isProjectWizard: true,
                templateId: this._templateId,
                functionSettings: this._functionSettings
            }));
        }

        return wizardOptions;
    }
}
