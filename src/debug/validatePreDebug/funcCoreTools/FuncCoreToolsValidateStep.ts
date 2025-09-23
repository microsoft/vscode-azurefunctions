/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from '@microsoft/vscode-azext-utils';
import { getLocalFuncCoreToolsVersion } from '../../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { type IPreDebugValidateContext } from '../IPreDebugValidateContext';

export class FuncCoreToolsValidateStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 320;

    public async execute(context: T): Promise<void> {
        context.funcCoreToolsVersion ??= await getLocalFuncCoreToolsVersion(context, context.workspaceFolder.uri.fsPath);

        if (!context.funcCoreToolsVersion) {
            throw new Error('');
        }
    }

    public shouldExecute(context: T): boolean {
        return context.validateFuncCoreTools;
    }

    // Add children
}
