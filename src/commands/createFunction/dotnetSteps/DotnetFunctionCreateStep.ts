/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Progress } from 'vscode';
import { AzureWizardExecuteStep } from 'vscode-azureextensionui';
import { localize } from "../../../localize";
import { executeDotnetTemplateCommand } from '../../../templates/executeDotnetTemplateCommand';
import { cpUtils } from '../../../utils/cpUtils';
import { dotnetUtils } from '../../../utils/dotnetUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { IDotnetFunctionWizardContext } from './IDotnetFunctionWizardContext';

export class DotnetFunctionCreateStep extends AzureWizardExecuteStep<IDotnetFunctionWizardContext> {
    public async execute(wizardContext: IDotnetFunctionWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        progress.report({ message: localize('creatingFunction', 'Creating {0}...', wizardContext.template.name) });
        await dotnetUtils.validateDotnetInstalled(wizardContext.actionContext);

        const args: string[] = [];
        args.push('--arg:name');
        args.push(cpUtils.wrapArgInQuotes(nonNullProp(wizardContext, 'functionName')));

        args.push('--arg:namespace');
        args.push(cpUtils.wrapArgInQuotes(nonNullProp(wizardContext, 'namespace')));

        for (const setting of wizardContext.template.userPromptedSettings) {
            args.push(`--arg:${setting.name}`);
            // tslint:disable-next-line: strict-boolean-expressions no-unsafe-any
            args.push(cpUtils.wrapArgInQuotes(wizardContext[setting.name] || ''));
        }

        await executeDotnetTemplateCommand(wizardContext.runtime, wizardContext.functionAppPath, 'create', '--identity', wizardContext.template.id, ...args);

        wizardContext.newFilePath = path.join(wizardContext.functionAppPath, `${wizardContext.functionName}.cs`);
    }

    public shouldExecute(wizardContext: IDotnetFunctionWizardContext): boolean {
        return !wizardContext.newFilePath;
    }
}
