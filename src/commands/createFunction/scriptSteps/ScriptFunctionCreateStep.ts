/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { functionJsonFileName, ProjectLanguage } from '../../../constants';
import { IFunctionBinding, IFunctionJson } from '../../../funcConfig/function';
import { localize } from '../../../localize';
import { IScriptFunctionTemplate } from '../../../templates/parseScriptTemplates';
import * as fsUtil from '../../../utils/fs';
import { nonNullProp } from '../../../utils/nonNull';
import { FunctionCreateStepBase } from '../FunctionCreateStepBase';
import { getBindingSetting } from '../IFunctionWizardContext';
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

export class ScriptFunctionCreateStep extends FunctionCreateStepBase<IScriptFunctionWizardContext> {
    public async executeCore(wizardContext: IScriptFunctionWizardContext): Promise<string> {
        const functionPath: string = path.join(wizardContext.projectPath, nonNullProp(wizardContext, 'functionName'));
        const template: IScriptFunctionTemplate = nonNullProp(wizardContext, 'functionTemplate');
        await fse.ensureDir(functionPath);
        await Promise.all(Object.keys(template.templateFiles).map(async f => {
            await fse.writeFile(path.join(functionPath, f), template.templateFiles[f]);
        }));

        const triggerBinding: IFunctionBinding = nonNullProp(template.functionJson, 'triggerBinding');
        for (const setting of template.userPromptedSettings) {
            triggerBinding[setting.name] = getBindingSetting(wizardContext, setting);
        }

        const functionJson: IFunctionJson = template.functionJson.data;
        if (this.editFunctionJson) {
            await this.editFunctionJson(wizardContext, functionJson);
        }

        await fsUtil.writeFormattedJson(path.join(functionPath, functionJsonFileName), functionJson);

        const language: ProjectLanguage = nonNullProp(wizardContext, 'language');
        const fileName: string | undefined = getScriptFileNameFromLanguage(language);
        if (!fileName) {
            throw new RangeError(localize('invalidLanguage', 'Invalid language "{0}".', language));
        }
        return path.join(functionPath, fileName);
    }

    protected editFunctionJson?(wizardContext: IScriptFunctionWizardContext, functionJson: IFunctionJson): Promise<void>;
}
