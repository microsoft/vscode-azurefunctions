/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activityFailContext, AzureWizardExecuteStepWithActivityOutput, createContextValue, type AzureWizardExecuteStep, type ExecuteActivityOutput, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { getDTSLocalSettingsValues, getDTSSettingsKeys } from "../../../commands/appSettings/connectionSettings/durableTaskScheduler/getDTSLocalProjectConnections";
import { ConnectionType, StorageType, warningIcon } from "../../../constants";
import { localize } from "../../../localize";
import { type IPreDebugValidateContext } from "../IPreDebugValidateContext";
import { isAliveConnection } from "../setConnections/setDTSConnectionPreDebug";
import { DTSHubConnectionValidateStep } from "./DTSHubConnectionValidateStep";

export class DTSConnectionValidateStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    // Todo:
    public priority: number = 350;
    public stepName: string = 'dtsConnectionValidateStep';

    protected getOutputLogSuccess = (context: T) => localize('validateDTSSuccess', 'Successfully found DTS connection value for setting "{0}".', context.newDTSConnectionSettingKey);
    protected getOutputLogFail = (context: T) => localize('validateDTSFail', 'Failed to find DTS connection value for setting "{0}".', context.newDTSConnectionSettingKey);
    protected getTreeItemLabel = (context: T) => context.newDTSConnectionSettingKey ?
        localize('dtsConnectionSettingLabel', '"{0}" setting', context.newDTSConnectionSettingKey) :
        localize('dtsConnectionSetting', 'DTS setting');

    private _connectionType?: string;

    public async execute(context: T, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        this.options.continueOnFail = true;
        progress.report({ message: localize('checkingDTSConnection', 'Checking for DTS connection...') });

        const { dtsConnectionKey, dtsHubConnectionKey } = await getDTSSettingsKeys(context) ?? {};
        context.newDTSConnectionSettingKey = dtsConnectionKey;
        context.newDTSHubConnectionSettingKey = dtsHubConnectionKey;

        const { dtsConnectionValue, dtsHubConnectionValue } = await getDTSLocalSettingsValues(context, {
            dtsConnectionKey,
            dtsHubConnectionKey,
        }) ?? {};
        context.newDTSConnectionSettingValue = dtsConnectionValue;
        context.newDTSHubConnectionSettingValue = dtsHubConnectionValue;

        if (!dtsConnectionValue) {
            throw new Error();
        }

        // If the emulator was already started earlier in the pre-debug flow, trust that it's
        // running and skip the alive check which can fail due to port mismatches or race conditions
        if (context.dtsEmulator) {
            this._connectionType = ConnectionType.Emulator;
            return;
        }

        if (!await isAliveConnection(context, dtsConnectionValue)) {
            this._connectionType = localize('stale', 'Stale');
            throw new Error();
        }

        this._connectionType = DTSConnectionValidateStep.classifyConnectionType(dtsConnectionValue);
    }

    public shouldExecute(context: T): boolean {
        return context.durableStorageType === StorageType.DTS;
    }

    public addExecuteSteps(_context: T): AzureWizardExecuteStep<T>[] {
        return [new DTSHubConnectionValidateStep(this._connectionType)];
    }

    public createSuccessOutput(context: T): ExecuteActivityOutput {
        const output = super.createSuccessOutput(context);
        if (output.item) {
            output.item.description = this._connectionType ? `DTS (${this._connectionType.toLowerCase()})` : undefined;
        }
        return output;
    }

    public createFailOutput(context: T): ExecuteActivityOutput {
        return {
            item: new ActivityChildItem({
                label: this.getTreeItemLabel(context),
                description: this._connectionType ? `DTS (${this._connectionType.toLowerCase()})` : undefined,
                activityType: ActivityChildType.Fail,
                iconPath: warningIcon,
                contextValue: createContextValue([`${this.stepName}Item`, activityFailContext]),
            }),
            message: this.getOutputLogFail(context),
        };
    }

    static classifyConnectionType(dtsConnection: string): ConnectionType {
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

    static async getDTSConnections(context: IActionContext & { projectPath: string }) {
        const { dtsConnectionKey, dtsHubConnectionKey } = await getDTSSettingsKeys(context) ?? {};
        const { dtsConnectionValue, dtsHubConnectionValue } = await getDTSLocalSettingsValues(context, { dtsConnectionKey, dtsHubConnectionKey }) ?? {};
        return {
            dtsConnectionKey,
            dtsConnectionValue,
            dtsHubConnectionKey,
            dtsHubConnectionValue,
        };
    }
}
