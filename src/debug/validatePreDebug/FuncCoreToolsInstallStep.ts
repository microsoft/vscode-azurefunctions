/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import { type IPreDebugValidateContext } from './IPreDebugValidateContext';

export class FuncCoreToolsInstallStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStep<T> {
    public async execute(context: T): Promise<void> {
        //
    }

    public shouldExecute(context: T): boolean {
        return !!context.shouldInstallFuncCoreTools;
    }
}
