/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { localize } from "../../../localize";
import { FunctionTemplates } from '../../../templates/IFunctionTemplate';
import { nonNullProp } from '../../../utils/nonNull';
import { assertTemplateIsV1 } from '../../../utils/templateVersionUtils';
import { FunctionNameStepBase } from '../FunctionNameStepBase';
import { IDotnetFunctionWizardContext, getFileExtension } from './IDotnetFunctionWizardContext';

export class DotnetFunctionNameStep extends FunctionNameStepBase<IDotnetFunctionWizardContext> {
    protected async getUniqueFunctionName(context: IDotnetFunctionWizardContext): Promise<string | undefined> {
        const template: FunctionTemplates = nonNullProp(context, 'functionTemplate');
        assertTemplateIsV1(template);
        return await this.getUniqueFsPath(context.projectPath, template.defaultFunctionName, getFileExtension(context));
    }

    protected async validateFunctionNameCore(context: IDotnetFunctionWizardContext, name: string): Promise<string | undefined> {
        if (await AzExtFsExtra.pathExists(path.join(context.projectPath, name + getFileExtension(context)))) {
            return localize('existingFile', 'A file with the name "{0}" already exists.', name);
        } else {
            return undefined;
        }
    }
}
