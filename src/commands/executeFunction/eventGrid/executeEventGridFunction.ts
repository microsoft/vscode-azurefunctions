/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, type AzureWizardExecuteStep, type AzureWizardPromptStep, type IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../localize';
import { type FunctionTreeItemBase } from '../../../tree/FunctionTreeItemBase';
import { type IFunction } from '../../../workspace/LocalFunction';
import { type EventGridExecuteFunctionContext } from './EventGridExecuteFunctionContext';
import { EventGridFileOpenStep } from './EventGridFileOpenStep';
import { EventGridSourceStep } from './EventGridSourceStep';
import { EventGridTypeStep } from './EventGridTypeStep';

export async function executeEventGridFunction(context: IActionContext, _node: FunctionTreeItemBase | IFunction): Promise<void> {
    const title: string = localize('executeEGFunction', 'Execute Event Grid Function');

    const promptSteps: AzureWizardPromptStep<EventGridExecuteFunctionContext>[] = [
        new EventGridSourceStep(),
        new EventGridTypeStep(),
    ];

    const executeSteps: AzureWizardExecuteStep<EventGridExecuteFunctionContext>[] = [
        new EventGridFileOpenStep(),
    ];

    const wizardContext: EventGridExecuteFunctionContext = {
        ...context,
        eventSource: undefined,
        selectedFileName: undefined,
        selectedFileUrl: undefined,
        fileOpened: false,
    };

    const wizard: AzureWizard<EventGridExecuteFunctionContext> = new AzureWizard(wizardContext, {
        title,
        promptSteps,
        executeSteps,
        showLoadingPrompt: true,
    });

    await wizard.prompt();
    await wizard.execute();
}
