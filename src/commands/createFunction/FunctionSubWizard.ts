/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, AzureWizardPromptStep, IWizardOptions } from '@microsoft/vscode-azext-utils';
import { ProjectLanguage } from '../../constants';
import { canValidateAzureWebJobStorageOnDebug } from '../../debug/validatePreDebug';
import { getAzureWebJobsStorage } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { IFunctionTemplate } from '../../templates/IFunctionTemplate';
import { isNodeV4Plus, isPythonV2Plus } from '../../utils/pythonUtils';
import { addBindingSettingSteps } from '../addBinding/settingSteps/addBindingSettingSteps';
import { AzureWebJobsStorageExecuteStep } from '../appSettings/AzureWebJobsStorageExecuteStep';
import { AzureWebJobsStoragePromptStep } from '../appSettings/AzureWebJobsStoragePromptStep';
import { JavaPackageNameStep } from '../createNewProject/javaSteps/JavaPackageNameStep';
import { DotnetFunctionCreateStep } from './dotnetSteps/DotnetFunctionCreateStep';
import { DotnetFunctionNameStep } from './dotnetSteps/DotnetFunctionNameStep';
import { DotnetNamespaceStep } from './dotnetSteps/DotnetNamespaceStep';
import { IFunctionWizardContext } from './IFunctionWizardContext';
import { JavaFunctionCreateStep } from './javaSteps/JavaFunctionCreateStep';
import { JavaFunctionNameStep } from './javaSteps/JavaFunctionNameStep';
import { OpenAPICreateStep } from './openAPISteps/OpenAPICreateStep';
import { OpenAPIGetSpecificationFileStep } from './openAPISteps/OpenAPIGetSpecificationFileStep';
import { NodeProgrammingModelFunctionCreateStep } from './scriptSteps/NodeProgrammingModelFunctionCreateStep';
import { NodeProgrammingModelFunctionNameStep } from './scriptSteps/NodeProgrammingModelFunctionNameStep';
import { PythonFunctionCreateStep } from './scriptSteps/PythonFunctionCreateStep';
import { PythonScriptStep } from './scriptSteps/PythonScriptStep';
import { ScriptFunctionCreateStep } from './scriptSteps/ScriptFunctionCreateStep';
import { ScriptFunctionNameStep } from './scriptSteps/ScriptFunctionNameStep';
import { TypeScriptFunctionCreateStep } from './scriptSteps/TypeScriptFunctionCreateStep';

export class FunctionSubWizard {
    public static async createSubWizard(context: IFunctionWizardContext, functionSettings: { [key: string]: string | undefined } | undefined): Promise<IWizardOptions<IFunctionWizardContext> | undefined> {
        functionSettings = functionSettings ?? {};

        const template: IFunctionTemplate | undefined = context.functionTemplate;
        if (template) {
            const promptSteps: AzureWizardPromptStep<IFunctionWizardContext>[] = [];

            const isV2PythonModel = isPythonV2Plus(context.language, context.languageModel);

            if (isV2PythonModel) {
                promptSteps.push(new PythonScriptStep());
            }

            switch (context.language) {
                case ProjectLanguage.Java:
                    promptSteps.push(new JavaPackageNameStep(), new JavaFunctionNameStep());
                    break;
                case ProjectLanguage.CSharp:
                case ProjectLanguage.FSharp:
                    promptSteps.push(new DotnetFunctionNameStep(), new DotnetNamespaceStep());
                    break;
                default:
                    if (isNodeV4Plus(context.language, context.languageModel)) {
                        promptSteps.push(new NodeProgrammingModelFunctionNameStep())
                    } else if (!isV2PythonModel) {
                        // NOTE: The V2 Python model has attributed bindings and we don't (yet) update them from the template.
                        promptSteps.push(new ScriptFunctionNameStep());
                    }
                    break;
            }

            // Add settings to context that were programmatically passed in
            for (const key of Object.keys(functionSettings)) {
                context[key.toLowerCase()] = functionSettings[key];
            }

            addBindingSettingSteps(template.userPromptedSettings, promptSteps);

            const executeSteps: AzureWizardExecuteStep<IFunctionWizardContext>[] = [];
            if (isNodeV4Plus(context.language, context.languageModel)) {
                executeSteps.push(new NodeProgrammingModelFunctionCreateStep());
            } else {
                switch (context.language) {
                    case ProjectLanguage.Java:
                        executeSteps.push(new JavaFunctionCreateStep());
                        break;
                    case ProjectLanguage.CSharp:
                    case ProjectLanguage.FSharp:
                        executeSteps.push(await DotnetFunctionCreateStep.createStep(context));
                        break;
                    case ProjectLanguage.TypeScript:
                        executeSteps.push(new TypeScriptFunctionCreateStep());
                        break;
                    default:
                        if (isV2PythonModel) {
                            executeSteps.push(new PythonFunctionCreateStep());
                        } else {
                            executeSteps.push(new ScriptFunctionCreateStep());
                        }
                        break;
                }
            }

            if ((!template.isHttpTrigger && !template.isSqlBindingTemplate) && !canValidateAzureWebJobStorageOnDebug(context.language) && !await getAzureWebJobsStorage(context, context.projectPath)) {
                promptSteps.push(new AzureWebJobsStoragePromptStep());
                executeSteps.push(new AzureWebJobsStorageExecuteStep());
            }

            const title: string = localize('createFunction', 'Create new {0}', template.name);
            return { promptSteps, executeSteps, title };
        } else if (context.generateFromOpenAPI) {
            const promptSteps: AzureWizardPromptStep<IFunctionWizardContext>[] = [];
            const executeSteps: AzureWizardExecuteStep<IFunctionWizardContext>[] = [];

            switch (context.language) {
                case ProjectLanguage.Java:
                    promptSteps.push(new JavaPackageNameStep());
                    break;
                case ProjectLanguage.CSharp:
                    promptSteps.push(new DotnetNamespaceStep());
                    break;
                default:
                    break;
            }

            promptSteps.push(new OpenAPIGetSpecificationFileStep());
            executeSteps.push(await OpenAPICreateStep.createStep(context));

            const title: string = localize('createFunction', 'Create new {0}', 'HTTP Triggers from OpenAPI (v2/v3) Specification File');
            return { promptSteps, executeSteps, title };
        } else {
            return undefined;
        }
    }
}
