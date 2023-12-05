/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type FuncVersion } from '../../../FuncVersion';
import { ext } from '../../../extensionVariables';
import { type FunctionTemplateBase } from '../../../templates/IFunctionTemplate';
import { executeDotnetTemplateCommand, validateDotnetInstalled } from '../../../templates/dotnet/executeDotnetTemplateCommand';
import { cpUtils } from '../../../utils/cpUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { assertTemplateIsV1 } from '../../../utils/templateVersionUtils';
import { FunctionCreateStepBase } from '../FunctionCreateStepBase';
import { getBindingSetting } from '../IFunctionWizardContext';
import { getFileExtension, type IDotnetFunctionWizardContext } from './IDotnetFunctionWizardContext';

export class DotnetFunctionCreateStep extends FunctionCreateStepBase<IDotnetFunctionWizardContext> {
    private constructor() {
        super();
    }

    public static async createStep(context: IActionContext): Promise<DotnetFunctionCreateStep> {
        await validateDotnetInstalled(context);
        return new DotnetFunctionCreateStep();
    }

    public async executeCore(context: IDotnetFunctionWizardContext): Promise<string> {
        const template: FunctionTemplateBase = nonNullProp(context, 'functionTemplate');
        assertTemplateIsV1(template);

        const functionName: string = nonNullProp(context, 'functionName');
        const args: string[] = [];
        args.push('--arg:name');
        args.push(cpUtils.wrapArgInQuotes(functionName));

        args.push('--arg:namespace');
        args.push(cpUtils.wrapArgInQuotes(nonNullProp(context, 'namespace')));

        for (const setting of template.userPromptedSettings) {
            const value = getBindingSetting(context, setting);
            // NOTE: Explicitly checking against undefined. Empty string is a valid value
            if (value !== undefined) {
                args.push(`--arg:${setting.name}`);
                args.push(cpUtils.wrapArgInQuotes(value));
            }
        }

        const version: FuncVersion = nonNullProp(context, 'version');
        let projectTemplateKey = context.projectTemplateKey;
        if (!projectTemplateKey) {
            const templateProvider = ext.templateProvider.get(context);
            projectTemplateKey = await templateProvider.getProjectTemplateKey(context, context.projectPath, nonNullProp(context, 'language'), undefined, context.version, undefined);
        }
        await executeDotnetTemplateCommand(context, version, projectTemplateKey, context.projectPath, 'create', '--identity', template.id, ...args);

        return path.join(context.projectPath, functionName + getFileExtension(context));
    }
}
