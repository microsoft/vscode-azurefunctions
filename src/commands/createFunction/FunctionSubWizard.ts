/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, AzureWizardPromptStep, IWizardOptions } from '@microsoft/vscode-azext-utils';
import { ProjectLanguage } from '../../constants';
import { localize } from '../../localize';
import { FunctionTemplateV2 } from '../../templates/FunctionTemplateV2';
import { IFunctionTemplate } from '../../templates/IFunctionTemplate';
import { isNodeV4Plus, isPythonV2Plus } from '../../utils/programmingModelUtils';
import { addBindingSettingSteps } from '../addBinding/settingSteps/addBindingSettingSteps';
import { JavaPackageNameStep } from '../createNewProject/javaSteps/JavaPackageNameStep';
import { FunctionWizardV2Context } from './FunctionV2WizardContext';
import { IFunctionWizardContext } from './IFunctionWizardContext';
import { JobsListStep } from './JobsListStep';
import { DotnetFunctionCreateStep } from './dotnetSteps/DotnetFunctionCreateStep';
import { DotnetFunctionNameStep } from './dotnetSteps/DotnetFunctionNameStep';
import { DotnetNamespaceStep } from './dotnetSteps/DotnetNamespaceStep';
import { DurableProjectConfigureStep } from './durableSteps/DurableProjectConfigureStep';
import { JavaFunctionCreateStep } from './javaSteps/JavaFunctionCreateStep';
import { JavaFunctionNameStep } from './javaSteps/JavaFunctionNameStep';
import { OpenAPICreateStep } from './openAPISteps/OpenAPICreateStep';
import { OpenAPIGetSpecificationFileStep } from './openAPISteps/OpenAPIGetSpecificationFileStep';
import { NodeV4FunctionCreateStep } from './scriptSteps/NodeV4FunctionCreateStep';
import { NodeV4FunctionNameStep } from './scriptSteps/NodeV4FunctionNameStep';
import { PythonFunctionCreateStep } from './scriptSteps/PythonFunctionCreateStep';
import { PythonScriptStep } from './scriptSteps/PythonScriptStep';
import { ScriptFunctionCreateStep } from './scriptSteps/ScriptFunctionCreateStep';
import { ScriptFunctionNameStep } from './scriptSteps/ScriptFunctionNameStep';
import { TypeScriptFunctionCreateStep } from './scriptSteps/TypeScriptFunctionCreateStep';

export class FunctionSubWizard {
    public static async createSubWizard(context: FunctionWizardV2Context, functionSettings: { [key: string]: string | undefined } | undefined, isProjectWizard?: boolean): Promise<IWizardOptions<IFunctionWizardContext> | undefined> {
        functionSettings = functionSettings ?? {};

        const template: IFunctionTemplate | FunctionTemplateV2 | undefined = context.functionTemplate ?? context.functionTemplateV2;
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
                    if (isNodeV4Plus(context)) {
                        promptSteps.push(new NodeV4FunctionNameStep())
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

            if ('wizards' in template) {
                // wizards is a unique property of v2 templates
                promptSteps.push(new JobsListStep(isProjectWizard));
                // the JobListStep will create the rest of the wizard
                return undefined;
            } else {
                addBindingSettingSteps(template.userPromptedSettings, promptSteps);
            }


            const executeSteps: AzureWizardExecuteStep<IFunctionWizardContext>[] = [];
            if (isNodeV4Plus(context)) {
                executeSteps.push(new NodeV4FunctionCreateStep());
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

            if (context.newDurableStorageType) {
                executeSteps.push(new DurableProjectConfigureStep());
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
