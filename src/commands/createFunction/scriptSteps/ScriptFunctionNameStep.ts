/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullProp } from '@microsoft/vscode-azext-utils';
import * as fse from 'fs-extra';
import * as path from 'path';
import { localize } from "../../../localize";
import { IScriptFunctionTemplate } from '../../../templates/script/parseScriptTemplates';
import { FunctionNameStepBase } from '../FunctionNameStepBase';
import { IScriptFunctionWizardContext } from './IScriptFunctionWizardContext';

export class ScriptFunctionNameStep extends FunctionNameStepBase<IScriptFunctionWizardContext> {
    protected async getUniqueFunctionName(context: IScriptFunctionWizardContext): Promise<string | undefined> {
        const template: IScriptFunctionTemplate = nonNullProp(context, 'functionTemplate');
        return await this.getUniqueFsPath(context.projectPath, template.defaultFunctionName);
    }

    protected async validateFunctionNameCore(context: IScriptFunctionWizardContext, name: string): Promise<string | undefined> {
        if (await fse.pathExists(path.join(context.projectPath, name))) {
            return localize('existingFolderError', 'A folder with the name "{0}" already exists.', name);
        } else {
            return undefined;
        }
    }
}
