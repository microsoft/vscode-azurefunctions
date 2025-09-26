/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activityFailContext, AzureWizardExecuteStepWithActivityOutput, createContextValue, type ExecuteActivityOutput } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { getStorageLocalSettingsValue } from "../../../../commands/appSettings/connectionSettings/azureWebJobsStorage/getStorageLocalProjectConnections";
import { ConnectionKey, ConnectionType, localStorageEmulatorConnectionString, warningIcon } from "../../../../constants";
import { localize } from "../../../../localize";
import { type IPreDebugValidateContext } from "../../IPreDebugValidateContext";

export class StorageConnectionValidateStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    // Todo:
    public priority: number = 360;
    public stepName: string = 'storageConnectionValidateStep';

    protected getOutputLogSuccess = () => localize('validateStorageSuccess', 'Successfully found a storage connection for "{0}".', this._storageConnectionKey);
    protected getOutputLogFail = () => localize('validateStorageFail', 'Failed to find a valid storage connection for "{0}".', this._storageConnectionKey);
    protected getTreeItemLabel = () => this._connectionType ?
        localize('validateStorageLabelWithType', 'Validate: Storage connection setting "{0}" ({1})', this._storageConnectionKey, this._connectionType.toLowerCase()) :
        localize('validateStorageLabel', 'Validate: Storage connection setting "{0}"', this._storageConnectionKey);

    private _storageConnectionKey: string = ConnectionKey.Storage;
    private _storageConnectionValue?: string | undefined;
    private _connectionType?: ConnectionType;

    public async execute(context: T, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        this.options.continueOnFail = true;

        progress.report({ message: localize('checkingStorageConnection', 'Checking for storage connection...') });

        this._storageConnectionValue = await getStorageLocalSettingsValue(context, this._storageConnectionKey);
        if (!this._storageConnectionValue) {
            throw new Error();
        }

        this._connectionType = this.classifyConnectionType(this._storageConnectionValue);
    }

    public shouldExecute(): boolean {
        return true;
    }

    private classifyConnectionType(storageConnection: string): ConnectionType {
        switch (true) {
            case storageConnection === localStorageEmulatorConnectionString:
                return ConnectionType.Emulator;
            case /core\.windows\.net/i.test(storageConnection):
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
