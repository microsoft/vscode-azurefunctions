/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStepWithActivityOutput } from '@microsoft/vscode-azext-utils';
import { getLocalFuncCoreToolsVersion } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { localize } from '../../localize';
import { type IPreDebugValidateContext } from './IPreDebugValidateContext';

export class FuncCoreToolsValidateStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    public priority: number = 320;
    public stepName: string = 'funcCoreToolsValidateStep';
    protected getOutputLogSuccess = (context: T) => localize('funcCoreToolsSuccess', 'Successfully found Azure Functions Core Tools (v{0}).', context.funcCoreToolsVersion);
    protected getOutputLogFail = () => localize('funcCoreToolsFail', 'Failed to find Azure Functions Core Tools.');
    protected getTreeItemLabel = (context: T) => context.funcCoreToolsVersion ?
        localize('funcCoreToolsVersionLabel', 'Validate: Azure Functions Core Tools (v{0})', context.funcCoreToolsVersion) :
        localize('funcCoreToolsLabel', 'Validate: Azure Functions Core Tools');

    public async execute(context: T): Promise<void> {
        context.funcCoreToolsVersion ??= await getLocalFuncCoreToolsVersion(context, context.workspaceFolder.uri.fsPath);
        if (!context.funcCoreToolsVersion) {
            context.abortDebug = true;
            throw new Error(this.getOutputLogFail());
        }
    }

    public shouldExecute(context: T): boolean {
        return context.validateFuncCoreTools;
    }
}
