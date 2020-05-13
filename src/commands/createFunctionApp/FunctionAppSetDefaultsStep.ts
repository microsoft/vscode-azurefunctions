/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Progress } from 'vscode';
import { AzureWizardExecuteStep } from 'vscode-azureextensionui';
import { localize } from '../../localize';
import { IFunctionAppWizardContext } from './IFunctionAppWizardContext';

export class FunctionAppSetDefaultsStep extends AzureWizardExecuteStep<IFunctionAppWizardContext> {
    public priority: number = 80;

    public async execute(context: IFunctionAppWizardContext, _progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        // todo context.showCreatingTreeItem(nonNullProp(wizardContext, 'newSiteName'));

        const newName: string | undefined = await context.relatedNameTask;
        if (!newName) {
            throw new Error(localize('noUniqueName', 'Failed to generate unique name for resources. Use advanced creation to manually enter resource names.'));
        }
        context.newResourceGroupName = context.newResourceGroupName || newName;
        context.newStorageAccountName = newName;
        context.newAppInsightsName = newName;
    }

    public shouldExecute(_context: IFunctionAppWizardContext): boolean {
        return true; // todo
    }
}
