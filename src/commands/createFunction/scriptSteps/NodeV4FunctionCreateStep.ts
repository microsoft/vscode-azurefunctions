/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, nonNullProp } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { functionSubpathSetting } from '../../../constants';
import { type IScriptFunctionTemplate } from '../../../templates/script/parseScriptTemplates';
import { getWorkspaceSetting } from '../../../vsCodeConfig/settings';
import { FunctionCreateStepBase } from '../FunctionCreateStepBase';
import { type IScriptFunctionWizardContext } from './IScriptFunctionWizardContext';
import { getFileExtensionFromLanguage } from './ScriptFunctionCreateStep';

export class NodeV4FunctionCreateStep extends FunctionCreateStepBase<IScriptFunctionWizardContext> {
    public async executeCore(context: IScriptFunctionWizardContext): Promise<string> {
        const functionSubpath: string = getWorkspaceSetting(functionSubpathSetting, context.projectPath) as string;
        const functionPath = path.join(context.projectPath, functionSubpath);
        await AzExtFsExtra.ensureDir(functionPath);

        const functionName = nonNullProp(context, 'functionName');
        const fileExt = getFileExtensionFromLanguage(context.language);
        const fileName = `${functionName}${fileExt}`;

        const template: IScriptFunctionTemplate = nonNullProp(context, 'functionTemplate');
        await Promise.all(Object.keys(template.templateFiles).map(async f => {
            let contents = template.templateFiles[f];
            contents = contents.replace(/%functionName%/g, functionName);

            for (const setting of template.userPromptedSettings) {
                // the setting name keys are lowercased
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                contents = contents.replace(new RegExp(`%${setting.name}%`, 'g'), context[setting.name.toLowerCase()] as string);
            }

            await AzExtFsExtra.writeFile(path.join(functionPath, fileName), contents);
        }));

        return path.join(functionPath, fileName);
    }
}
