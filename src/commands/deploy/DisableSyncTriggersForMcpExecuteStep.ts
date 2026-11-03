/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import { type IFuncDeployContext } from "./deploy";

export class DisableSyncTriggersForMcpExecuteStep<T extends IFuncDeployContext> extends AzureWizardExecuteStep<T> {
    public readonly priority: number = 305;
    public readonly stepName: string = 'DisableSyncTriggersForMcpExecuteStep';

    public async execute(context: T): Promise<void> {
        context.syncTriggersPostDeploy = false;
    }

    public shouldExecute(context: T): boolean {
        return context.isMcpProject === true;
    }
}
