/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activityFailContext, AzureWizardExecuteStepWithActivityOutput, createContextValue, type ExecuteActivityOutput } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { getDTSLocalSettingsValues, getDTSSettingsKeys } from "../../../commands/appSettings/connectionSettings/durableTaskScheduler/getDTSLocalProjectConnections";
import { tryGetVariableSubstitutedKey } from "../../../commands/appSettings/connectionSettings/getVariableSubstitutedKey";
import { StorageType, warningIcon } from "../../../constants";
import { localize } from "../../../localize";
import { type IPreDebugValidateContext } from "../IPreDebugValidateContext";

export class DTSHubConnectionValidateStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    // Todo:
    public priority: number = 351;
    public stepName: string = 'dtsHubConnectionValidateStep';

    protected getOutputLogSuccess = () => localize('validateDTSHubSuccess', 'Successfully found a DTS hub connection.');
    protected getOutputLogFail = () => localize('validateDTSHubFail', 'Failed to find a DTS hub connection.');
    protected getTreeItemLabel = () => {
        const hubKey = this._dtsHubConnectionKey ? (tryGetVariableSubstitutedKey(this._dtsHubConnectionKey) ?? this._dtsHubConnectionKey) : undefined;
        return hubKey ? `"${hubKey}" setting` : localize('dtsHubLabel', 'DTS hub setting');
    };

    private _dtsHubConnectionKey: string | undefined;

    constructor(private readonly _connectionType: string | undefined) {
        super();
    }

    public async execute(context: T, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        this.options.continueOnFail = true;

        progress.report({ message: localize('checkingDTSConnection', 'Checking for DTS hub connection...') });

        const { dtsConnectionKey, dtsHubConnectionKey } = await getDTSSettingsKeys(context) ?? {};
        this._dtsHubConnectionKey = dtsHubConnectionKey;

        const { dtsHubConnectionValue } = await getDTSLocalSettingsValues(context, {
            dtsConnectionKey,
            dtsHubConnectionKey,
        }) ?? {};

        if (!dtsHubConnectionValue) {
            throw new Error();
        }
    }

    public shouldExecute(context: T): boolean {
        return context.durableStorageType === StorageType.DTS;
    }

    public createSuccessOutput(context: T): ExecuteActivityOutput {
        const output = super.createSuccessOutput(context);
        if (output.item) {
            output.item.description = this._connectionType ? `DTS hub (${this._connectionType.toLowerCase()})` : undefined;
        }
        return output;
    }

    public createFailOutput(): ExecuteActivityOutput {
        return {
            item: new ActivityChildItem({
                label: this.getTreeItemLabel(),
                description: this._connectionType ? `DTS hub (${this._connectionType.toLowerCase()})` : undefined,
                tooltip: this.getOutputLogFail(),
                activityType: ActivityChildType.Fail,
                iconPath: warningIcon,
                contextValue: createContextValue([`${this.stepName}Item`, activityFailContext]),
            }),
            message: this.getOutputLogFail(),
        };
    }
}
