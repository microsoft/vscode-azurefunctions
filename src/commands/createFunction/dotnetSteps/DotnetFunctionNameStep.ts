/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { localize } from "../../../localize";
import { IFunctionTemplate } from '../../../templates/IFunctionTemplate';
import * as fsUtil from '../../../utils/fs';
import { nonNullProp } from '../../../utils/nonNull';
import { FunctionNameStepBase } from '../FunctionNameStepBase';
import { IDotnetFunctionWizardContext } from './IDotnetFunctionWizardContext';

export class DotnetFunctionNameStep extends FunctionNameStepBase<IDotnetFunctionWizardContext> {
    protected async getUniqueFunctionName(wizardContext: IDotnetFunctionWizardContext): Promise<string | undefined> {
        const template: IFunctionTemplate = nonNullProp(wizardContext, 'functionTemplate');
        return await fsUtil.getUniqueFsPath(wizardContext.projectPath, template.defaultFunctionName, '.cs');
    }

    protected async validateFunctionNameCore(wizardContext: IDotnetFunctionWizardContext, name: string): Promise<string | undefined> {
        if (await fse.pathExists(path.join(wizardContext.projectPath, `${name}.cs`))) {
            return localize('existingFile', 'A file with the name "{0}" already exists.', name);
        } else {
            return undefined;
        }
    }
}
