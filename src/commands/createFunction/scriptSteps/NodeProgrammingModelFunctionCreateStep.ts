/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, nonNullProp } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ProjectLanguage } from '../../../constants';
import { IScriptFunctionTemplate } from '../../../templates/script/parseScriptTemplates';
import { FunctionCreateStepBase } from '../FunctionCreateStepBase';
import { IPythonFunctionWizardContext } from './IPythonFunctionWizardContext';
import { IScriptFunctionWizardContext } from './IScriptFunctionWizardContext';
import { getScriptFileNameFromLanguage } from './ScriptFunctionCreateStep';

export class NodeProgrammingModelFunctionCreateStep extends FunctionCreateStepBase<IPythonFunctionWizardContext> {
    public async executeCore(context: IScriptFunctionWizardContext): Promise<string> {
        const functionPath = path.join(context.projectPath, 'src', 'functions');
        await AzExtFsExtra.ensureDir(functionPath);
        const template: IScriptFunctionTemplate = nonNullProp(context, 'functionTemplate');
        await Promise.all(Object.keys(template.templateFiles).map(async f => {
            const filename = f.replace(/%functionName%/g, nonNullProp(context, 'functionName'));
            let contents = template.templateFiles[f];
            contents = contents.replace(/%functionName%/g, nonNullProp(context, 'functionName'));

            for (const setting of template.userPromptedSettings) {
                // the setting name keys are lowercased
                contents = contents.replace(new RegExp(`%${setting.name}%`, 'g'), context[setting.name.toLowerCase()]);
            }

            await AzExtFsExtra.writeFile(path.join(functionPath, filename), contents);
        }));

        const language: ProjectLanguage = nonNullProp(context, 'language');
        const fileName = getScriptFileNameFromLanguage(language) as string;
        return path.join(functionPath, fileName);
    }
}
