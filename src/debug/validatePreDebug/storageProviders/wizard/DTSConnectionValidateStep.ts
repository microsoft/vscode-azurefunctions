/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activityFailContext, AzureWizardExecuteStepWithActivityOutput, createContextValue, type AzureWizardExecuteStep, type ExecuteActivityOutput } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { getDTSLocalSettingsValues, getDTSSettingsKeys } from "../../../../commands/appSettings/connectionSettings/durableTaskScheduler/getDTSLocalProjectConnections";
import { ConnectionType, DurableBackend, warningIcon } from "../../../../constants";
import { localize } from "../../../../localize";
import { type IPreDebugValidateContext } from "../../IPreDebugValidateContext";
import { isAliveConnection } from "../setDTSConnectionPreDebug";
import { DTSHubConnectionValidateStep } from "./DTSHubConnectionValidateStep";

export class DTSConnectionValidateStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    // Todo:
    public priority: number = 350;
    public stepName: string = 'dtsConnectionValidateStep';

    protected getOutputLogSuccess = () => localize('validateDTSSuccess', 'Successfully found DTS connection value for setting "{0}".', this._dtsConnectionKey);
    protected getOutputLogFail = () => localize('validateDTSFail', 'Failed to find DTS connection value for setting "{0}".', this._dtsConnectionKey);
    protected getTreeItemLabel = () => !this._dtsConnectionKey ?
        localize('validateDTSGenericLabel', 'Validate: DTS connection setting') :
        this._connectionType ?
            localize('validateDTSLabelWithType', 'Validate: DTS connection setting "{0}" ({1})', this._dtsConnectionKey, this._connectionType.toLowerCase()) :
            localize('validateDTSLabel', 'Validate: DTS connection setting "{0}"', this._dtsConnectionKey);

    private _dtsConnectionKey?: string;
    private _dtsConnectionValue?: string | undefined;
    private _connectionType?: string;

    private _dtsHubConnectionKey?: string;
    private _dtsHubConnectionValue?: string | undefined;

    public async execute(context: T, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        this.options.continueOnFail = true;

        progress.report({ message: localize('checkingDTSConnection', 'Checking for DTS connection...') });

        const { dtsConnectionKey, dtsHubConnectionKey } = await getDTSSettingsKeys(context) ?? {};
        this._dtsConnectionKey = dtsConnectionKey;
        this._dtsHubConnectionKey = dtsHubConnectionKey;

        const { dtsConnectionValue, dtsHubConnectionValue } = await getDTSLocalSettingsValues(context, { dtsConnectionKey, dtsHubConnectionKey }) ?? {};
        this._dtsConnectionValue = dtsConnectionValue;
        this._dtsHubConnectionValue = dtsHubConnectionValue;

        if (!this._dtsConnectionValue) {
            throw new Error();
        }

        if (!await isAliveConnection(context, this._dtsConnectionValue)) {
            this._connectionType = localize('stale', 'Stale');
            throw new Error();
        }

        this._connectionType = this.classifyConnectionType(this._dtsConnectionValue);
    }

    public shouldExecute(context: T): boolean {
        return context.durableStorageType === DurableBackend.DTS;
    }

    public addExecuteSteps(): AzureWizardExecuteStep<T>[] {
        return [new DTSHubConnectionValidateStep(this._dtsHubConnectionKey, this._dtsHubConnectionValue)];
    }

    private classifyConnectionType(dtsConnection: string): ConnectionType {
        const endpointMatch = dtsConnection.match(/Endpoint=([^;]+)/);

        const url: string | undefined = endpointMatch?.[1] ?? '';
        switch (true) {
            case /localhost/i.test(url):
                return ConnectionType.Emulator;
            case /core\.windows\.net/i.test(url):
                return ConnectionType.Azure;
            default:
                return ConnectionType.Custom;
        }
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
