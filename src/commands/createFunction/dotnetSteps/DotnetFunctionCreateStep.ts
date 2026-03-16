/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg, withNamedArg } from '@microsoft/vscode-processutils';
import * as path from 'path';
import { type FuncVersion } from '../../../FuncVersion';
import { ext } from '../../../extensionVariables';
import { type FunctionTemplateBase } from '../../../templates/IFunctionTemplate';
import { executeDotnetTemplateCommand, validateDotnetInstalled } from '../../../templates/dotnet/executeDotnetTemplateCommand';
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

        // Build setting args dynamically
        const settingArgs = template.userPromptedSettings
            .filter(setting => getBindingSetting(context, setting) !== undefined)
            .flatMap(setting => {
                const value = getBindingSetting(context, setting);
                return withNamedArg(`--arg:${setting.name}`, String(value), { shouldQuote: true })();
            });

        const args = composeArgs(
            withNamedArg('--identity', template.id),
            withNamedArg('--arg:name', functionName, { shouldQuote: true }),
            withNamedArg('--arg:namespace', nonNullProp(context, 'namespace'), { shouldQuote: true }),
            withArg(...settingArgs),
        )();

        const version: FuncVersion = nonNullProp(context, 'version');
        let projectTemplateKey = context.projectTemplateKey;
        if (!projectTemplateKey) {
            const templateProvider = ext.templateProvider.get(context);
            projectTemplateKey = await templateProvider.getProjectTemplateKey(context, context.projectPath, nonNullProp(context, 'language'), undefined, context.version, undefined);
        }
        await executeDotnetTemplateCommand(context, version, projectTemplateKey, context.projectPath, 'create', args);

        return path.join(context.projectPath, functionName + getFileExtension(context));
    }
}
