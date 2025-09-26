/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStepWithActivityOutput } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { DurableBackend } from "../../../../constants";
import { localize } from "../../../../localize";
import { type IPreDebugValidateContext } from "../../IPreDebugValidateContext";

export class DTSHubConnectionValidateStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    // Todo:
    public priority: number = 351;
    public stepName: string = 'dtsHubConnectionValidateStep';

    protected getOutputLogSuccess = () => localize('validateDTSHubSuccess', 'Successfully found a DTS Hub connection.');
    protected getOutputLogFail = () => localize('validateDTSHubFail', 'Failed to find a DTS Hub connection.');
    protected getTreeItemLabel = () => this._dtsHubConnectionValue ?
        localize('validateDTSLabelWithValue', 'Validate: DTS Hub "{0}"', this._dtsHubConnectionValue) :
        localize('validateDTSLabel', 'Validate: DTS Hub');

    constructor(readonly _dtsHubConnectionKey: string | undefined, readonly _dtsHubConnectionValue: string | undefined) {
        super();
    }

    public async execute(_: T, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        this.options.continueOnFail = true;

        progress.report({ message: localize('checkingDTSConnection', 'Checking for DTS hub connection...') });

        if (!this._dtsHubConnectionValue) {
            throw new Error();
        }
    }

    public shouldExecute(context: T): boolean {
        return context.durableStorageType === DurableBackend.DTS;
    }
}
