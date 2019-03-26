/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { localize } from "../../../localize";
import { IScriptFunctionTemplate } from '../../../templates/parseScriptTemplates';
import * as fsUtil from '../../../utils/fs';
import { nonNullProp } from '../../../utils/nonNull';
import { FunctionNameStepBase } from '../FunctionNameStepBase';
import { IScriptFunctionWizardContext } from './IScriptFunctionWizardContext';

export class ScriptFunctionNameStep extends FunctionNameStepBase<IScriptFunctionWizardContext> {
    protected async getUniqueFunctionName(wizardContext: IScriptFunctionWizardContext): Promise<string | undefined> {
        const template: IScriptFunctionTemplate = nonNullProp(wizardContext, 'functionTemplate');
        return await fsUtil.getUniqueFsPath(wizardContext.projectPath, template.defaultFunctionName);
    }

    protected async validateFunctionNameCore(wizardContext: IScriptFunctionWizardContext, name: string): Promise<string | undefined> {
        if (await fse.pathExists(path.join(wizardContext.projectPath, name))) {
            return localize('existingFolderError', 'A folder with the name "{0}" already exists.', name);
        } else {
            return undefined;
        }
    }
}
