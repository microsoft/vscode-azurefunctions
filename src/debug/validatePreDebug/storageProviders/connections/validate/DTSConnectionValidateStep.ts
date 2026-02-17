/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activityFailContext, AzureWizardExecuteStepWithActivityOutput, createContextValue, type AzureWizardExecuteStep, type ExecuteActivityOutput, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { getDTSLocalSettingsValues, getDTSSettingsKeys } from "../../../../../commands/appSettings/connectionSettings/durableTaskScheduler/getDTSLocalProjectConnections";
import { ConnectionType, warningIcon } from "../../../../../constants";
import { localize } from "../../../../../localize";
import { type IPreDebugValidateContext } from "../../../IPreDebugValidateContext";
import { isAliveConnection } from "../set/setDTSConnectionPreDebug";
import { DTSHubConnectionValidateStep } from "./DTSHubConnectionValidateStep";

export class DTSConnectionValidateStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    // Todo:
    public priority: number = 350;
    public stepName: string = 'dtsConnectionValidateStep';

    protected getOutputLogSuccess = (context: T) => localize('validateDTSSuccess', 'Successfully found DTS connection value for setting "{0}".', context.newDTSConnectionSettingKey);
    protected getOutputLogFail = (context: T) => localize('validateDTSFail', 'Failed to find DTS connection value for setting "{0}".', context.newDTSConnectionSettingKey);
    protected getTreeItemLabel = (context: T) => !context.newDTSConnectionSettingKey ?
        localize('validateDTSGenericLabel', 'Validate: DTS connection setting') :
        this._connectionType ?
            localize('validateDTSLabelWithType', 'Validate: DTS connection setting "{0}" ({1})', context.newDTSConnectionSettingKey, this._connectionType.toLowerCase()) :
            localize('validateDTSLabel', 'Validate: DTS connection setting "{0}"', context.newDTSConnectionSettingKey);

    private _connectionType?: string;

    public async execute(context: T, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        this.options.continueOnFail = true;

        progress.report({ message: localize('checkingDTSConnection', 'Checking for DTS connection...') });

        if (!context.newDTSConnectionSettingKey || !context.newDTSHubConnectionSettingKey) {
            const { dtsConnectionKey, dtsHubConnectionKey } = await getDTSSettingsKeys(context) ?? {};
            context.newDTSConnectionSettingKey = dtsConnectionKey;
            context.newDTSHubConnectionSettingKey = dtsHubConnectionKey;
        }

        if (!context.newDTSConnectionSettingValue || !context.newDTSHubConnectionSettingValue) {
            const { dtsConnectionValue, dtsHubConnectionValue } = await getDTSLocalSettingsValues(context, {
                dtsConnectionKey: context.newDTSConnectionSettingKey,
                dtsHubConnectionKey: context.newDTSHubConnectionSettingValue,
            }) ?? {};
            context.newDTSConnectionSettingValue = dtsConnectionValue;
            context.newDTSHubConnectionSettingKey = dtsHubConnectionValue;
        }

        if (!context.newDTSConnectionSettingValue) {
            throw new Error();
        }

        if (!await isAliveConnection(context, context.newDTSConnectionSettingValue)) {
            this._connectionType = localize('stale', 'Stale');
            throw new Error();
        }

        this._connectionType = this.classifyConnectionType(context.newDTSConnectionSettingValue);
    }

    public shouldExecute(context: T): boolean {
        return !context.newDTSConnectionSettingKey || !context.newDTSConnectionSettingValue;
    }

    public addExecuteSteps(context: T): AzureWizardExecuteStep<T>[] {
        return [new DTSHubConnectionValidateStep(context.newDTSHubConnectionSettingKey, context.newDTSHubConnectionSettingValue)];
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

    public createFailOutput(context: T): ExecuteActivityOutput {
        return {
            item: new ActivityChildItem({
                label: this.getTreeItemLabel(context),
                tooltip: this.getOutputLogFail(context),
                activityType: ActivityChildType.Fail,
                iconPath: warningIcon,
                contextValue: createContextValue([`${this.stepName}Item`, activityFailContext]),
            }),
            message: this.getOutputLogFail(context),
        };
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
