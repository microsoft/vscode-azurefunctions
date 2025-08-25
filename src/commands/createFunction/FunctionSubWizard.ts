/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureWizardExecuteStep, type AzureWizardPromptStep, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { ProjectLanguage } from '../../constants';
import { localize } from '../../localize';
import { type FunctionTemplateBase } from '../../templates/IFunctionTemplate';
import { TemplateSchemaVersion } from '../../templates/TemplateProviderBase';
import { isNodeV4Plus } from '../../utils/programmingModelUtils';
import { assertTemplateIsV1 } from '../../utils/templateVersionUtils';
import { addBindingSettingSteps } from '../addBinding/settingSteps/addBindingSettingSteps';
import { JavaPackageNameStep } from '../createNewProject/javaSteps/JavaPackageNameStep';
import { type IFunctionWizardContext } from './IFunctionWizardContext';
import { JobsListStep } from './JobsListStep';
import { BallerinaFunctionCreateStep } from './ballerinaSteps/BallerinaFunctionCreateStep';
import { BallerinaFunctionNameStep } from './ballerinaSteps/BallerinaFunctionNameStep';
import { DotnetFunctionCreateStep } from './dotnetSteps/DotnetFunctionCreateStep';
import { DotnetFunctionNameStep } from './dotnetSteps/DotnetFunctionNameStep';
import { DotnetNamespaceStep } from './dotnetSteps/DotnetNamespaceStep';
import { JavaFunctionCreateStep } from './javaSteps/JavaFunctionCreateStep';
import { JavaFunctionNameStep } from './javaSteps/JavaFunctionNameStep';
import { OpenAPICreateStep } from './openAPISteps/OpenAPICreateStep';
import { OpenAPIGetSpecificationFileStep } from './openAPISteps/OpenAPIGetSpecificationFileStep';
import { NodeV4FunctionCreateStep } from './scriptSteps/NodeV4FunctionCreateStep';
import { NodeV4FunctionNameStep } from './scriptSteps/NodeV4FunctionNameStep';
import { ScriptFunctionCreateStep } from './scriptSteps/ScriptFunctionCreateStep';
import { ScriptFunctionNameStep } from './scriptSteps/ScriptFunctionNameStep';
import { TypeScriptFunctionCreateStep } from './scriptSteps/TypeScriptFunctionCreateStep';

export class FunctionSubWizard {
    public static async createSubWizard(context: IFunctionWizardContext, functionSettings: { [key: string]: string | undefined } | undefined, isProjectWizard?: boolean): Promise<IWizardOptions<IFunctionWizardContext> | undefined> {
        functionSettings = functionSettings ?? {};

        const template: FunctionTemplateBase | undefined = context.functionTemplate;
        if (template) {
            const promptSteps: AzureWizardPromptStep<IFunctionWizardContext>[] = [];
            switch (context.language) {
                case ProjectLanguage.Java:
                    promptSteps.push(new JavaPackageNameStep(), new JavaFunctionNameStep());
                    break;
                case ProjectLanguage.Ballerina:
                    promptSteps.push(new BallerinaFunctionNameStep());
                    break;
                case ProjectLanguage.CSharp:
                case ProjectLanguage.FSharp:
                    promptSteps.push(new DotnetFunctionNameStep(), new DotnetNamespaceStep());
                    break;
                default:
                    if (isNodeV4Plus(context)) {
                        promptSteps.push(new NodeV4FunctionNameStep())
                    } else if (context.templateSchemaVersion === TemplateSchemaVersion.v1) {
                        promptSteps.push(new ScriptFunctionNameStep());
                    }
                    break;
            }

            // Add settings to context that were programmatically passed in
            for (const key of Object.keys(functionSettings)) {
                context[key.toLowerCase()] = functionSettings[key];
            }

            // if skip for now, we need to just skip this step as well
            if (!!template && context.templateSchemaVersion === TemplateSchemaVersion.v2) {
                // wizards is a unique property of v2 templates
                promptSteps.push(new JobsListStep(isProjectWizard));
                // the JobListStep will create the rest of the wizard
                return { promptSteps };
            } else {
                assertTemplateIsV1(template);
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
                    case ProjectLanguage.Ballerina:
                        executeSteps.push(new BallerinaFunctionCreateStep());
                        break;
                    default:
                        executeSteps.push(new ScriptFunctionCreateStep());
                        break;
                }
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
