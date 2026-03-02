/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import { StorageType } from '../../../../../constants';
import { type IPreDebugValidateContext } from '../../../IPreDebugValidateContext';
import { DTSConnectionValidateStep } from './DTSConnectionValidateStep';
import { EventHubsNamespaceConnectionValidateStep } from './EventHubsNamespaceConnectionValidateStep';
import { SQLConnectionValidateStep } from './SQLConnectionValidateStep';
import { StorageConnectionValidateStep } from './StorageConnectionValidateStep';

export class GetStorageProviderConnectionsValidateSteps<T extends IPreDebugValidateContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 330;

    public async execute(): Promise<void> {
        // Do nothing, we're just leveraging the 'addExecuteSteps' method
    }

    public shouldExecute(): boolean {
        return true;
    }

    public async addExecuteSteps(context: T): Promise<AzureWizardExecuteStep<T>[]> {
        const executeSteps: AzureWizardExecuteStep<T>[] = [];

        switch (context.durableStorageType) {
            case StorageType.DTS:
                executeSteps.push(new DTSConnectionValidateStep());
                break;
            case StorageType.Netherite:
                executeSteps.push(new EventHubsNamespaceConnectionValidateStep());
                break;
            case StorageType.SQL:
                executeSteps.push(new SQLConnectionValidateStep());
                break;
            case StorageType.Storage:
            default:
        }

        executeSteps.push(new StorageConnectionValidateStep());

        return executeSteps;
    }
}
