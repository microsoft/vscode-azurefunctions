/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { localize } from "../../../localize";
import { type IScriptFunctionTemplate } from '../../../templates/script/parseScriptTemplates';
import { nonNullProp } from '../../../utils/nonNull';
import { FunctionNameStepBase } from '../FunctionNameStepBase';
import { type IScriptFunctionWizardContext } from './IScriptFunctionWizardContext';

export class ScriptFunctionNameStep extends FunctionNameStepBase<IScriptFunctionWizardContext> {
    protected async getUniqueFunctionName(context: IScriptFunctionWizardContext): Promise<string | undefined> {
        const template: IScriptFunctionTemplate = nonNullProp(context, 'functionTemplate');
        return await this.getUniqueFsPath(context.projectPath, template.defaultFunctionName);
    }

    protected async validateFunctionNameCore(context: IScriptFunctionWizardContext, name: string): Promise<string | undefined> {
        if (await AzExtFsExtra.pathExists(path.join(context.projectPath, name))) {
            return localize('existingFolderError', 'A folder with the name "{0}" already exists.', name);
        } else {
            return undefined;
        }
    }
}
