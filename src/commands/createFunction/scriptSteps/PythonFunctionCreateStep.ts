/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { ProjectLanguage } from '../../../constants';
import { IFunctionBinding } from '../../../funcConfig/function';
import { IScriptFunctionTemplate } from '../../../templates/script/parseScriptTemplates';
import { nonNullProp } from '../../../utils/nonNull';
import { FunctionCreateStepBase } from '../FunctionCreateStepBase';
import { getBindingSetting } from '../IFunctionWizardContext';
import { FunctionLocation, IPythonFunctionWizardContext } from './IPythonFunctionWizardContext';
import { openReadOnlyContent } from '@microsoft/vscode-azext-utils';

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

export class PythonFunctionCreateStep extends FunctionCreateStepBase<IPythonFunctionWizardContext> {
    public async executeCore(context: IPythonFunctionWizardContext): Promise<string> {
        const template: IScriptFunctionTemplate = nonNullProp(context, 'functionTemplate');
        const triggerBinding: IFunctionBinding = nonNullProp(template.functionJson, 'triggerBinding');

        for (const setting of template.userPromptedSettings) {
            triggerBinding[setting.name] = getBindingSetting(context, setting);
        }

        // TODO: Pull out correct content once it's actually in the feed.
        const content = template.templateFiles['__init__.py'];

        if (context.functionLocation === FunctionLocation.Document) {
            const functionName = nonNullProp(context, 'functionName');

            openReadOnlyContent(
                {
                    label: functionName,
                    fullId: `vscode-azurefunctions/functions/${functionName}`
                },
                content,
                '.py');

            return ''; // TODO: Allow not returning filename.
        } else {
            const functionScriptPath: string = path.join(context.projectPath, nonNullProp(context, 'functionScript'));

            await fse.appendFile(functionScriptPath, '\r\n' + content);

            return functionScriptPath;
        }
    }
}
