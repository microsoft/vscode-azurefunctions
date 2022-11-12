/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, IParsedError, parseError } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { functionJsonFileName, ProjectLanguage } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { IFunctionBinding, IFunctionJson } from '../../../funcConfig/function';
import { localize } from '../../../localize';
import { IScriptFunctionTemplate } from '../../../templates/script/parseScriptTemplates';
import { cpUtils } from '../../../utils/cpUtils';
import { durableUtils } from '../../../utils/durableUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { pythonUtils } from '../../../utils/pythonUtils';
import { venvUtils } from '../../../utils/venvUtils';
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

        return fileName ? path.join(functionPath, fileName) : functionJsonPath;
    }

    protected async _installDurableDependencies(context: IScriptFunctionWizardContext): Promise<void> {
        const language: ProjectLanguage = nonNullProp(context, 'language');

        try {
            switch (language) {
                case ProjectLanguage.JavaScript:
                case ProjectLanguage.TypeScript:
                    await cpUtils.executeCommand(ext.outputChannel, context.projectPath, 'npm', 'install', durableUtils.nodeDfPackage);
                    break;
                case ProjectLanguage.PowerShell:
                    // Todo: Revisit when adding PowerShell implementation
                    break;
                case ProjectLanguage.Python:
                    await pythonUtils.addDependencyToRequirements(durableUtils.pythonDfPackage);
                    await venvUtils.runPipInstallCommandIfPossible();
                    break;
                default:
            }
        } catch (error) {
            const pError: IParsedError = parseError(error);
            const dfDepInstallFailed: string = localize('failedToAddDurableDependency', 'Failed to add or install durable package dependency. Please inspect and verify if it needs to be added manually.');
            ext.outputChannel.appendLog(pError.message);
            ext.outputChannel.appendLog(dfDepInstallFailed);
        }
    }

    protected editFunctionJson?(context: IScriptFunctionWizardContext, functionJson: IFunctionJson): Promise<void>;
}
