/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, nonNullValueAndProp } from '@microsoft/vscode-azext-utils';
import { type INetheriteAzureConnectionWizardContext } from '../INetheriteConnectionWizardContext';

export class EventHubGetConnectionStep<T extends INetheriteAzureConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 236;

    public async execute(context: T): Promise<void> {
        context.newEventHubConnectionSettingValue = nonNullValueAndProp(context.eventHub, 'name');
    }

    public shouldExecute(context: T): boolean {
        return !!context.eventHub;
    }
}
