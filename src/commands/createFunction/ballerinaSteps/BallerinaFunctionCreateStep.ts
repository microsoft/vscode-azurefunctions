/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, nonNullProp } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { FunctionCreateStepBase } from '../FunctionCreateStepBase';
import { IBallerinaFunctionTemplate, IBallerinaFunctionWizardContext } from './IBallerinaFunctionWizardContext';

export class BallerinaFunctionCreateStep extends FunctionCreateStepBase<IBallerinaFunctionWizardContext> {
    public async executeCore(context: IBallerinaFunctionWizardContext): Promise<string> {
        const functionPath = context.projectPath;
        await AzExtFsExtra.ensureDir(functionPath);

        const functionName = nonNullProp(context, 'functionName');
        const fileName = `${functionName}.bal`;

        const template: IBallerinaFunctionTemplate = nonNullProp(context, 'functionTemplate');
        await Promise.all(Object.keys(template.templateFiles).map(async f => {
            let contents = template.templateFiles[f];
            contents = contents.replace(/%functionName%/g, functionName);

            for (const setting of template.userPromptedSettings) {
                // the setting name keys are lowercased
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                contents = contents.replace(new RegExp(`%${setting.name}%`, 'g'), context[setting.name.toLowerCase()]);
            }

            await AzExtFsExtra.writeFile(path.join(functionPath, fileName), contents);
        }));

        return path.join(functionPath, fileName);
    }
}
