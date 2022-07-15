/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullProp } from '@microsoft/vscode-azext-utils';
import * as fse from 'fs-extra';
import * as path from 'path';
import { localize } from "../../../localize";
import { IFunctionTemplate } from '../../../templates/IFunctionTemplate';
import { FunctionNameStepBase } from '../FunctionNameStepBase';
import { getFileExtension, IDotnetFunctionWizardContext } from './IDotnetFunctionWizardContext';

export class DotnetFunctionNameStep extends FunctionNameStepBase<IDotnetFunctionWizardContext> {
    protected async getUniqueFunctionName(context: IDotnetFunctionWizardContext): Promise<string | undefined> {
        const template: IFunctionTemplate = nonNullProp(context, 'functionTemplate');
        return await this.getUniqueFsPath(context.projectPath, template.defaultFunctionName, getFileExtension(context));
    }

    protected async validateFunctionNameCore(context: IDotnetFunctionWizardContext, name: string): Promise<string | undefined> {
        if (await fse.pathExists(path.join(context.projectPath, name + getFileExtension(context)))) {
            return localize('existingFile', 'A file with the name "{0}" already exists.', name);
        } else {
            return undefined;
        }
    }
}
