/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type FuncVersion } from '../../../FuncVersion';
import { ext } from '../../../extensionVariables';
import { type FunctionTemplateBase } from '../../../templates/IFunctionTemplate';
import { executeDotnetTemplateCreate, validateDotnetInstalled } from '../../../templates/dotnet/executeDotnetTemplateCommand';
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

        // Build template args as a record
        const templateArgs: Record<string, string> = {
            name: functionName,
            namespace: nonNullProp(context, 'namespace'),
        };

        for (const setting of template.userPromptedSettings) {
            const value = getBindingSetting(context, setting);
            if (value !== undefined) {
                templateArgs[setting.name] = String(value);
            }
        }

        const version: FuncVersion = nonNullProp(context, 'version');
        let projectTemplateKey = context.projectTemplateKey;
        if (!projectTemplateKey) {
            const templateProvider = ext.templateProvider.get(context);
            projectTemplateKey = await templateProvider.getProjectTemplateKey(context, context.projectPath, nonNullProp(context, 'language'), undefined, context.version, undefined);
        }
        await executeDotnetTemplateCreate(context, version, projectTemplateKey, context.projectPath, template.id, templateArgs);

        return path.join(context.projectPath, functionName + getFileExtension(context));
    }
}
