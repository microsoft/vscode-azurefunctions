/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, AzureWizardPromptStep, IAzureQuickPickItem, IWizardOptions, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { QuickPickOptions } from 'vscode';
import { previewPythonModel, ProjectLanguage, pysteinModelSetting } from '../../constants';
import { localize, pythonNewModelPreview } from '../../localize';
import { nonNullProp } from '../../utils/nonNull';
import { openUrl } from '../../utils/openUrl';
import { pythonUtils } from '../../utils/pythonUtils';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { FunctionListStep } from '../createFunction/FunctionListStep';
import { addInitVSCodeSteps } from '../initProjectForVSCode/InitVSCodeLanguageStep';
import { DotnetRuntimeStep } from './dotnetSteps/DotnetRuntimeStep';
import { IProjectWizardContext } from './IProjectWizardContext';
import { addJavaCreateProjectSteps } from './javaSteps/addJavaCreateProjectSteps';
import { CustomProjectCreateStep } from './ProjectCreateStep/CustomProjectCreateStep';
import { DotnetProjectCreateStep } from './ProjectCreateStep/DotnetProjectCreateStep';
import { JavaScriptProjectCreateStep } from './ProjectCreateStep/JavaScriptProjectCreateStep';
import { PowerShellProjectCreateStep } from './ProjectCreateStep/PowerShellProjectCreateStep';
import { PysteinProjectCreateStep } from './ProjectCreateStep/PysteinProjectCreateStep';
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
        let languagePicks: IAzureQuickPickItem<{ language: ProjectLanguage, model?: number } | undefined>[] = [
            { label: ProjectLanguage.JavaScript, data: { language: ProjectLanguage.JavaScript } },
            { label: ProjectLanguage.TypeScript, data: { language: ProjectLanguage.TypeScript } },
            { label: ProjectLanguage.CSharp, data: { language: ProjectLanguage.CSharp } },
            { label: ProjectLanguage.Python, data: { language: ProjectLanguage.Python } },
            { label: pythonNewModelPreview, data: { language: ProjectLanguage.Python, model: previewPythonModel } },
            { label: ProjectLanguage.Java, data: { language: ProjectLanguage.Java } },
            { label: ProjectLanguage.PowerShell, data: { language: ProjectLanguage.PowerShell } },
            { label: localize('customHandler', 'Custom Handler'), data: { language: ProjectLanguage.Custom } }
        ];

        languagePicks.push({ label: localize('viewSamples', '$(link-external) View sample projects'), data: undefined, suppressPersistence: true });

        if (context.languageFilter) {
            languagePicks = languagePicks.filter(p => {
                return p.data !== undefined && context.languageFilter?.test(p.data.language);
            });
        }

        if (!getWorkspaceSetting(pysteinModelSetting)) {
            languagePicks = languagePicks.filter(p => {
                return p.label !== pythonNewModelPreview;
            })
        }

        const options: QuickPickOptions = { placeHolder: localize('selectLanguage', 'Select a language') };
        const result = (await context.ui.showQuickPick(languagePicks, options)).data;
        if (result === undefined) {
            await openUrl('https://aka.ms/AA4ul9b');
            throw new UserCancelledError('viewSampleProjects');
        } else {
            context.language = result.language;
            context.languageModel = result.model;
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
                executeSteps.push(
                    pythonUtils.isV2Plus(context.language, context.languageModel)
                        ? new PysteinProjectCreateStep()
                        : new PythonProjectCreateStep());
                break;
            case ProjectLanguage.PowerShell:
                executeSteps.push(new PowerShellProjectCreateStep());
                break;
            case ProjectLanguage.Java:
                await addJavaCreateProjectSteps(context, promptSteps, executeSteps);
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

        // Languages except Python v2+ and Java support creating a function after creating a project
        // Java needs to fix this issue first: https://github.com/Microsoft/vscode-azurefunctions/issues/81
        if (!pythonUtils.isV2Plus(context.language, context.languageModel)) {
            promptSteps.push(await FunctionListStep.create(context, {
                isProjectWizard: true,
                templateId: this._templateId,
                functionSettings: this._functionSettings
            }));
        }

        return wizardOptions;
    }
}
