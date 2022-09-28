/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { functionJsonFileName, ProjectLanguage } from '../../../constants';
import { IFunctionBinding, IFunctionJson } from '../../../funcConfig/function';
import { IScriptFunctionTemplate } from '../../../templates/script/parseScriptTemplates';
import { nodeUtils } from '../../../utils/nodeUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { FunctionCreateStepBase } from '../FunctionCreateStepBase';
import { getBindingSetting } from '../IFunctionWizardContext';
import { IScriptFunctionWizardContext } from './IScriptFunctionWizardContext';

export function getScriptFileNameFromLanguage(language: string): string | undefined {
    switch (language) {
        case ProjectLanguage.CSharpScript:
            return 'run.csx';
        case ProjectLanguage.FSharpScript:
            return 'run.fsx';
        case ProjectLanguage.JavaScript:
            return 'index.js';
        case ProjectLanguage.PowerShell:
            return 'run.ps1';
        case ProjectLanguage.Python:
            return '__init__.py';
        case ProjectLanguage.TypeScript:
            return 'index.ts';
        default:
            return undefined;
    }
}

export class ScriptFunctionCreateStep extends FunctionCreateStepBase<IScriptFunctionWizardContext> {
    public async executeCore(context: IScriptFunctionWizardContext): Promise<string> {
        const functionPath: string = path.join(context.projectPath, nonNullProp(context, 'functionName'));
        const template: IScriptFunctionTemplate = nonNullProp(context, 'functionTemplate');
        await AzExtFsExtra.ensureDir(functionPath);
        await Promise.all(Object.keys(template.templateFiles).map(async f => {
            await AzExtFsExtra.writeFile(path.join(functionPath, f), template.templateFiles[f]);
        }));

        const triggerBinding: IFunctionBinding = nonNullProp(template.functionJson, 'triggerBinding');
        for (const setting of template.userPromptedSettings) {
            triggerBinding[setting.name] = getBindingSetting(context, setting);
        }

        const functionJson: IFunctionJson = template.functionJson.data;
        if (this.editFunctionJson) {
            await this.editFunctionJson(context, functionJson);
        }

        const functionJsonPath: string = path.join(functionPath, functionJsonFileName);
        await AzExtFsExtra.writeJSON(functionJsonPath, functionJson);

        const language: ProjectLanguage = nonNullProp(context, 'language');
        const fileName: string | undefined = getScriptFileNameFromLanguage(language);

        await this.installDependencies(language, context.projectPath);
        return fileName ? path.join(functionPath, fileName) : functionJsonPath;
    }

    private async installDependencies(language: string, projectPath: string): Promise<void> {
        switch (language) {
            case ProjectLanguage.CSharpScript:
            case ProjectLanguage.FSharpScript:
            case ProjectLanguage.JavaScript:
                await nodeUtils.installDependencies(projectPath);
                break;
            case ProjectLanguage.PowerShell:
            case ProjectLanguage.Python:
            case ProjectLanguage.TypeScript:
                await nodeUtils.installDependencies(projectPath);
                break;
            default:
        }
    }

    protected editFunctionJson?(context: IScriptFunctionWizardContext, functionJson: IFunctionJson): Promise<void>;
}
