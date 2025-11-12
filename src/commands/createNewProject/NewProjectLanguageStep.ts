/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type AzureWizardExecuteStep, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { type QuickPickOptions } from 'vscode';
import { ProjectLanguage, nodeDefaultModelVersion, nodeLearnMoreLink, nodeModels, pythonDefaultModelVersion, pythonLearnMoreLink, pythonModels, showBallerinaProjectCreationSetting } from '../../constants';
import { localize } from '../../localize';
import { TemplateSchemaVersion } from '../../templates/TemplateProviderBase';
import { nonNullProp } from '../../utils/nonNull';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { FunctionListStep } from '../createFunction/FunctionListStep';
import { addInitVSCodeSteps } from '../initProjectForVSCode/InitVSCodeLanguageStep';
import { type IProjectWizardContext } from './IProjectWizardContext';
import { ProgrammingModelStep } from './ProgrammingModelStep';
import { CustomProjectCreateStep } from './ProjectCreateStep/CustomProjectCreateStep';
import { DotnetProjectCreateStep } from './ProjectCreateStep/DotnetProjectCreateStep';
import { JavaScriptProjectCreateStep } from './ProjectCreateStep/JavaScriptProjectCreateStep';
import { PowerShellProjectCreateStep } from './ProjectCreateStep/PowerShellProjectCreateStep';
import { PythonProjectCreateStep } from './ProjectCreateStep/PythonProjectCreateStep';
import { ScriptProjectCreateStep } from './ProjectCreateStep/ScriptProjectCreateStep';
import { TypeScriptProjectCreateStep } from './ProjectCreateStep/TypeScriptProjectCreateStep';
import { addBallerinaCreateProjectSteps } from './ballerinaSteps/addBallerinaCreateProjectSteps';
import { DotnetRuntimeStep } from './dotnetSteps/DotnetRuntimeStep';
import { addJavaCreateProjectSteps } from './javaSteps/addJavaCreateProjectSteps';
import { MCPDownloadSampleCodeExecuteStep } from './mcpServerSteps/MCPDownloadSampleCodeExecuteStep';
import { MCPIncludeSampleCodePromptStep } from './mcpServerSteps/MCPIncludeSampleCodePromptStep';
import { MCPProjectCreateStep } from './mcpServerSteps/MCPProjectCreateStep';
import { MCPServerLanguagePromptStep } from './mcpServerSteps/MCPServerLanguagePromptStep';

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
        let languagePicks: IAzureQuickPickItem<{ language: ProjectLanguage, model?: number }>[] = [
            { label: ProjectLanguage.JavaScript, data: { language: ProjectLanguage.JavaScript } },
            { label: ProjectLanguage.TypeScript, data: { language: ProjectLanguage.TypeScript } },
            { label: ProjectLanguage.CSharp, data: { language: ProjectLanguage.CSharp } },
            { label: ProjectLanguage.Python, data: { language: ProjectLanguage.Python } },
            { label: ProjectLanguage.Java, data: { language: ProjectLanguage.Java } },
            { label: ProjectLanguage.PowerShell, data: { language: ProjectLanguage.PowerShell } },
            { label: localize('customHandler', 'Custom Handler'), data: { language: ProjectLanguage.Custom } },
            { label: localize('selfHostedMCPServer', 'Self-hosted MCP server'), data: { language: ProjectLanguage.SelfHostedMCPServer } }
        ];

        if (getWorkspaceSetting(showBallerinaProjectCreationSetting)) {
            languagePicks.push({ label: ProjectLanguage.Ballerina, data: { language: ProjectLanguage.Ballerina } });
        }

        if (context.languageFilter) {
            languagePicks = languagePicks.filter(p => {
                return context.languageFilter?.test(p.data.language);
            });
        }

        const options: QuickPickOptions = { placeHolder: localize('selectProjectType', 'Select a project type') };
        const result = (await context.ui.showQuickPick(languagePicks, options)).data;
        context.language = result.language;
        this.setTemplateSchemaVersion(context);
    }

    public shouldPrompt(context: IProjectWizardContext): boolean {
        this.setTemplateSchemaVersion(context);
        return context.language === undefined;
    }

    public async getSubWizard(context: IProjectWizardContext): Promise<IWizardOptions<IProjectWizardContext>> {
        const language: ProjectLanguage = nonNullProp(context, 'language');
        const executeSteps: AzureWizardExecuteStep<IProjectWizardContext>[] = [];

        const promptSteps: AzureWizardPromptStep<IProjectWizardContext>[] = [];
        switch (language) {
            case ProjectLanguage.JavaScript:
                promptSteps.push(new ProgrammingModelStep({
                    models: nodeModels,
                    defaultModel: nodeDefaultModelVersion,
                    learnMoreLink: nodeLearnMoreLink,
                    isProjectWizard: true
                }));
                executeSteps.push(new JavaScriptProjectCreateStep());
                break;
            case ProjectLanguage.TypeScript:
                promptSteps.push(new ProgrammingModelStep({
                    models: nodeModels,
                    defaultModel: nodeDefaultModelVersion,
                    learnMoreLink: nodeLearnMoreLink,
                    isProjectWizard: true
                }));
                executeSteps.push(new TypeScriptProjectCreateStep());
                break;
            case ProjectLanguage.CSharp:
            case ProjectLanguage.FSharp:
                promptSteps.push(await DotnetRuntimeStep.createStep(context));
                executeSteps.push(await DotnetProjectCreateStep.createStep(context));
                break;
            case ProjectLanguage.Python:
                promptSteps.push(new ProgrammingModelStep({
                    models: pythonModels,
                    defaultModel: pythonDefaultModelVersion,
                    learnMoreLink: pythonLearnMoreLink,
                    isProjectWizard: true
                }));
                executeSteps.push(new PythonProjectCreateStep());
                break;
            case ProjectLanguage.PowerShell:
                executeSteps.push(new PowerShellProjectCreateStep());
                break;
            case ProjectLanguage.Java:
                await addJavaCreateProjectSteps(context, promptSteps, executeSteps);
                break;
            case ProjectLanguage.Ballerina:
                await addBallerinaCreateProjectSteps(context, promptSteps, executeSteps);
                break;
            case ProjectLanguage.Custom:
                executeSteps.push(new CustomProjectCreateStep());
                break;
            case ProjectLanguage.SelfHostedMCPServer:
                promptSteps.push(new MCPServerLanguagePromptStep(), new MCPIncludeSampleCodePromptStep());
                executeSteps.push(new MCPDownloadSampleCodeExecuteStep(), new MCPProjectCreateStep());
                break;
            default:
                executeSteps.push(new ScriptProjectCreateStep());
                break;
        }

        await addInitVSCodeSteps(context, promptSteps, executeSteps);

        const wizardOptions: IWizardOptions<IProjectWizardContext> = { promptSteps, executeSteps };

        // All languages except Java support creating a function after creating a project
        // Java needs to fix this issue first: https://github.com/Microsoft/vscode-azurefunctions/issues/81
        promptSteps.push(new FunctionListStep({
            isProjectWizard: true,
            templateId: this._templateId,
            functionSettings: this._functionSettings,
        }));

        return wizardOptions;
    }

    private setTemplateSchemaVersion(context: IProjectWizardContext): void {
        // TODO: Probably should include a ProgrammingModelStep for all languages and set there. but for now we know if it's not Python, there's no way it'll be v2
        if (context.language && context.language !== ProjectLanguage.Python) {
            context.templateSchemaVersion = TemplateSchemaVersion.v1;
        }
    }
}
