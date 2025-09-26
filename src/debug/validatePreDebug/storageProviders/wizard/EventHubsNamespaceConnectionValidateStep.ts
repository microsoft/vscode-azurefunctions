/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activityFailContext, AzureWizardExecuteStepWithActivityOutput, createContextValue, type AzureWizardExecuteStep, type ExecuteActivityOutput } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { getNetheriteLocalSettingsValues, getNetheriteSettingsKeys } from "../../../../commands/appSettings/connectionSettings/netherite/getNetheriteLocalProjectConnections";
import { ConnectionType, DurableBackend, localEventHubsEmulatorConnectionRegExp, warningIcon } from "../../../../constants";
import { localize } from "../../../../localize";
import { type IPreDebugValidateContext } from "../../IPreDebugValidateContext";
import { EventHubConnectionValidateStep } from "./EventHubConnectionValidateStep";

export class EventHubsNamespaceConnectionValidateStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    // Todo:
    public priority: number = 350;
    public stepName: string = 'eventHubsNamespaceConnectionValidateStep';

    protected getOutputLogSuccess = () => localize('validateEHNSuccess', 'Successfully found Event Hubs Namespace connection value for setting "{0}".', this._eventHubsNamespaceConnectionKey);
    protected getOutputLogFail = () => localize('validateEHNFail', 'Failed to find a valid Event Hubs Namespace connection value for setting "{0}".', this._eventHubsNamespaceConnectionKey);
    protected getTreeItemLabel = () => !this._eventHubsNamespaceConnectionKey ?
        localize('validateEHNGenericLabel', 'Validate: Event Hubs Namespace connection setting') :
        this._connectionType ?
            localize('validateEHNLabelWithType', 'Validate: Event Hubs Namespace connection setting "{0}" ({1})', this._eventHubsNamespaceConnectionKey, this._connectionType.toLowerCase()) :
            localize('validateEHNLabel', 'Validate: Event Hubs Namespace connection setting "{0}"', this._eventHubsNamespaceConnectionKey);

    private _eventHubsNamespaceConnectionKey?: string;
    private _eventHubsNamespaceConnectionValue?: string | undefined;
    private _connectionType?: string;

    private _eventHubConnectionKey?: string;
    private _eventHubConnectionValue?: string | undefined;

    public async execute(context: T, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        this.options.continueOnFail = true;

        progress.report({ message: localize('checkingNetheriteConnection', 'Checking for Netherite connection...') });

        const { eventHubsNamespaceConnectionKey, eventHubConnectionKey } = await getNetheriteSettingsKeys(context) ?? {};
        this._eventHubsNamespaceConnectionKey = eventHubsNamespaceConnectionKey;
        this._eventHubConnectionKey = eventHubConnectionKey;

        const { eventHubsNamespaceConnectionValue, eventHubConnectionValue } = await getNetheriteLocalSettingsValues(context, { eventHubsNamespaceConnectionKey, eventHubConnectionKey }) ?? {};
        this._eventHubsNamespaceConnectionValue = eventHubsNamespaceConnectionValue;
        this._eventHubConnectionValue = eventHubConnectionValue;

        if (!this._eventHubsNamespaceConnectionValue) {
            throw new Error();
        }

        this._connectionType = this.classifyConnectionType(this._eventHubsNamespaceConnectionValue);
    }

    public shouldExecute(context: T): boolean {
        return context.durableStorageType === DurableBackend.Netherite;
    }

    public addExecuteSteps(): AzureWizardExecuteStep<T>[] {
        return [new EventHubConnectionValidateStep(this._eventHubConnectionKey, this._eventHubConnectionValue)];
    }

    private classifyConnectionType(ehnConnection: string): ConnectionType {
        switch (true) {
            case localEventHubsEmulatorConnectionRegExp.test(ehnConnection):
                return ConnectionType.Emulator;
            case /servicebus\.windows\.net/i.test(ehnConnection):
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
