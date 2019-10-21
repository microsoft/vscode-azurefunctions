/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { IActionContext } from 'vscode-azureextensionui';
import { FuncVersion } from '../../../FuncVersion';
import { executeDotnetTemplateCommand } from '../../../templates/dotnet/executeDotnetTemplateCommand';
import { IFunctionTemplate } from '../../../templates/IFunctionTemplate';
import { cpUtils } from '../../../utils/cpUtils';
import { dotnetUtils } from '../../../utils/dotnetUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { FunctionCreateStepBase } from '../FunctionCreateStepBase';
import { getBindingSetting } from '../IFunctionWizardContext';
import { getFileExtension, IDotnetFunctionWizardContext } from './IDotnetFunctionWizardContext';

export class DotnetFunctionCreateStep extends FunctionCreateStepBase<IDotnetFunctionWizardContext> {
    private constructor() {
        super();
    }

    public static async createStep(context: IActionContext): Promise<DotnetFunctionCreateStep> {
        await dotnetUtils.validateDotnetInstalled(context);
        return new DotnetFunctionCreateStep();
    }

    public async executeCore(context: IDotnetFunctionWizardContext): Promise<string> {
        const template: IFunctionTemplate = nonNullProp(context, 'functionTemplate');

        const functionName: string = nonNullProp(context, 'functionName');
        const args: string[] = [];
        args.push('--arg:name');
        args.push(cpUtils.wrapArgInQuotes(functionName));

        args.push('--arg:namespace');
        args.push(cpUtils.wrapArgInQuotes(nonNullProp(context, 'namespace')));

        for (const setting of template.userPromptedSettings) {
            const value: string | undefined = getBindingSetting(context, setting);
            // NOTE: Explicitly checking against undefined. Empty string is a valid value
            if (value !== undefined) {
                args.push(`--arg:${setting.name}`);
                args.push(cpUtils.wrapArgInQuotes(value));
            }
        }

        const version: FuncVersion = nonNullProp(context, 'version');
        await executeDotnetTemplateCommand(version, context.projectPath, 'create', '--identity', template.id, ...args);

        return path.join(context.projectPath, functionName + getFileExtension(context));
    }
}
