/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activityFailContext, AzureWizardExecuteStepWithActivityOutput, createContextValue, type ExecuteActivityOutput } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { DurableBackend, warningIcon } from "../../../../constants";
import { localize } from "../../../../localize";
import { type IPreDebugValidateContext } from "../../IPreDebugValidateContext";

export class EventHubConnectionValidateStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    // Todo:
    public priority: number = 351;
    public stepName: string = 'eventHubConnectionValidateStep';

    protected getOutputLogSuccess = () => localize('validateEHNHubSuccess', 'Successfully found Event Hub "{0}".', this._eventHubConnectionValue);
    protected getOutputLogFail = () => localize('validateEHNHubFail', 'Failed to find a valid Event Hub.');
    protected getTreeItemLabel = () => this._eventHubConnectionValue ?
        localize('validateEHNLabelWithValue', 'Validate: Event Hub "{0}"', this._eventHubConnectionValue) :
        localize('validateEHNLabel', 'Validate: Event Hub');

    constructor(readonly _eventHubConnectionKey: string | undefined, readonly _eventHubConnectionValue: string | undefined) {
        super();
    }

    public async execute(_: T, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        this.options.continueOnFail = true;

        progress.report({ message: localize('checkingEventHubConnection', 'Checking for event hub connection...') });

        if (!this._eventHubConnectionValue) {
            throw new Error();
        }
    }

    public shouldExecute(context: T): boolean {
        return context.durableStorageType === DurableBackend.Netherite;
    }

    public createFailOutput(): ExecuteActivityOutput {
        return {
            item: new ActivityChildItem({
                label: this.getTreeItemLabel(),
                tooltip: this.getOutputLogFail(),
                activityType: ActivityChildType.Fail,
                iconPath: warningIcon,
                contextValue: createContextValue([`${this.stepName}Item`, activityFailContext]),
            }),
            message: this.getOutputLogFail(),
        };
    }
}
