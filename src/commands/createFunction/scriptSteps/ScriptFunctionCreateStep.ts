/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { Progress } from 'vscode';
import { AzureWizardExecuteStep } from 'vscode-azureextensionui';
import { ProjectLanguage } from '../../../constants';
import { IFunctionJson } from '../../../FunctionConfig';
import { localize } from "../../../localize";
import * as fsUtil from '../../../utils/fs';
import { nonNullProp } from '../../../utils/nonNull';
import { IScriptFunctionWizardContext } from './IScriptFunctionWizardContext';

export function getScriptFileNameFromLanguage(language: string): string | undefined {
    switch (language) {
        case ProjectLanguage.Bash:
            return 'run.sh';
        case ProjectLanguage.Batch:
            return 'run.bat';
        case ProjectLanguage.CSharpScript:
            return 'run.csx';
        case ProjectLanguage.FSharpScript:
            return 'run.fsx';
        case ProjectLanguage.JavaScript:
            return 'index.js';
        case ProjectLanguage.PHP:
            return 'run.php';
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

export class ScriptFunctionCreateStep extends AzureWizardExecuteStep<IScriptFunctionWizardContext> {
    public async execute(wizardContext: IScriptFunctionWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        progress.report({ message: localize('creatingFunction', 'Creating {0}...', wizardContext.template.name) });

        const functionPath: string = path.join(wizardContext.functionAppPath, nonNullProp(wizardContext, 'functionName'));
        await fse.ensureDir(functionPath);
        await Promise.all(Object.keys(wizardContext.template.templateFiles).map(async fileName => {
            await fse.writeFile(path.join(functionPath, fileName), wizardContext.template.templateFiles[fileName]);
        }));

        for (const setting of wizardContext.template.userPromptedSettings) {
            // tslint:disable-next-line: strict-boolean-expressions no-unsafe-any
            wizardContext.template.functionConfig.inBinding[setting.name] = wizardContext[setting.name] || '';
        }

        const functionJson: IFunctionJson = wizardContext.template.functionConfig.functionJson;
        if (this.editFunctionJson) {
            await this.editFunctionJson(wizardContext, functionJson);
        }

        await fsUtil.writeFormattedJson(path.join(functionPath, 'function.json'), functionJson);

        const scriptFileName: string | undefined = getScriptFileNameFromLanguage(wizardContext.language);
        if (scriptFileName) {
            wizardContext.newFilePath = path.join(functionPath, scriptFileName);
        }
    }

    public shouldExecute(wizardContext: IScriptFunctionWizardContext): boolean {
        return !wizardContext.newFilePath;
    }

    protected editFunctionJson?(wizardContext: IScriptFunctionWizardContext, functionJson: IFunctionJson): Promise<void>;
}
