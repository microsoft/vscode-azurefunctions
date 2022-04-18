/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, DialogResponses, nonNullProp } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { IDeleteWizardContext } from './IDeleteWizardContext';

export class ConfirmDeleteStep extends AzureWizardPromptStep<IDeleteWizardContext> {
    public async prompt(context: IDeleteWizardContext): Promise<void> {
        const node = nonNullProp(context, 'node');
        const confirmMessage: string = localize('deleteConfirmation', 'Are you sure you want to delete function app "{0}"?', node.site.fullName);
        await context.ui.showWarningMessage(confirmMessage, { modal: true }, DialogResponses.deleteResponse);
    }

    public shouldPrompt(): boolean {
        return true;
    }
}
