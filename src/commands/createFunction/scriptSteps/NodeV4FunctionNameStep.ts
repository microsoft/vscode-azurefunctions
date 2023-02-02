/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { functionSubpathSetting, tsDefaultSrcDir } from '../../../constants';
import { localize } from "../../../localize";
import { IScriptFunctionTemplate } from '../../../templates/script/parseScriptTemplates';
import { nonNullProp } from '../../../utils/nonNull';
import { getWorkspaceSetting } from '../../../vsCodeConfig/settings';
import { FunctionNameStepBase } from '../FunctionNameStepBase';
import { IScriptFunctionWizardContext } from './IScriptFunctionWizardContext';
import { getFileExtensionFromLanguage } from './ScriptFunctionCreateStep';

export class NodeV4FunctionNameStep extends FunctionNameStepBase<IScriptFunctionWizardContext> {
    protected async getUniqueFunctionName(context: IScriptFunctionWizardContext): Promise<string | undefined> {
        const template: IScriptFunctionTemplate = nonNullProp(context, 'functionTemplate');
        const fileExt = getFileExtensionFromLanguage(context.language);
        const functionSubpath: string = getWorkspaceSetting(functionSubpathSetting, context.projectPath) as string;
        return await this.getUniqueFsPath(
            path.join(context.projectPath, fileExt?.toLowerCase() === '.ts' ? tsDefaultSrcDir : '', functionSubpath),
            template.defaultFunctionName,
            fileExt);
    }

    protected async validateFunctionNameCore(context: IScriptFunctionWizardContext, name: string): Promise<string | undefined> {
        const functionSubpath: string = getWorkspaceSetting(functionSubpathSetting, context.projectPath) as string;
        const fileExt = getFileExtensionFromLanguage(context.language);
        name = `${name}${fileExt}`;

        if (await AzExtFsExtra.pathExists(path.join(context.projectPath, fileExt?.toLowerCase() === '.ts' ? tsDefaultSrcDir : '', functionSubpath, name))) {
            return localize('existingFileError', 'A file with the name "{0}" already exists.', name);
        } else {
            return undefined;
        }
    }
}
