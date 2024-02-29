/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, type AzureWizardExecuteStep, type AzureWizardPromptStep, type IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../localize';
import { type FunctionTreeItemBase } from '../../../tree/FunctionTreeItemBase';
import { type IFunction } from '../../../workspace/LocalFunction';
import { EventGridEventSourceStep } from './EventGridEventSourceStep';
import { EventGridEventTypeStep } from './EventGridEventTypeStep';
import { type ExecuteEventGridFunctionContext } from './ExecuteEventGridFunctionContext';
import { OpenEventGridFileStep } from './OpenEventGridFileStep';

export async function executeEventGridFunction(context: IActionContext, _node: FunctionTreeItemBase | IFunction): Promise<void> {
    const title: string = localize('executeEGFunction', 'Execute Event Grid Function');

    const promptSteps: AzureWizardPromptStep<ExecuteEventGridFunctionContext>[] = [
        new EventGridEventSourceStep(),
        new EventGridEventTypeStep(),
    ];

    const executeSteps: AzureWizardExecuteStep<ExecuteEventGridFunctionContext>[] = [
        new OpenEventGridFileStep(),
    ];

    const wizardContext: ExecuteEventGridFunctionContext = {
        ...context,
        eventSource: undefined,
        selectedFileName: undefined,
        selectedFileUrl: undefined,
        selectedFileContent: undefined,
        fileOpened: false,
    };

    const wizard: AzureWizard<ExecuteEventGridFunctionContext> = new AzureWizard(wizardContext, {
        title,
        promptSteps,
        executeSteps,
        showLoadingPrompt: true,
    });

    await wizard.prompt();
    await wizard.execute();
}
