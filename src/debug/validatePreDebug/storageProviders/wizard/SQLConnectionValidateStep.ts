/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activityFailContext, AzureWizardExecuteStepWithActivityOutput, createContextValue, type ExecuteActivityOutput } from "@microsoft/vscode-azext-utils";
import { type Progress } from "vscode";
import { getSqlDbLocalSettingsValue, getSqlDbSettingsKey } from "../../../../commands/appSettings/connectionSettings/sqlDatabase/getSqlDbLocalProjectConnections";
import { ConnectionType, DurableBackend, warningIcon } from "../../../../constants";
import { localize } from "../../../../localize";
import { type IPreDebugValidateContext } from "../../IPreDebugValidateContext";

export class SQLConnectionValidateStep<T extends IPreDebugValidateContext> extends AzureWizardExecuteStepWithActivityOutput<T> {
    // Todo:
    public priority: number = 350;
    public stepName: string = 'sqlConnectionValidateStep';

    protected getOutputLogSuccess = () => localize('validateSQLSuccess', 'Successfully found a SQL database connection value for setting "{0}".', this._sqlConnectionKey);
    protected getOutputLogFail = () => localize('validateSQLFail', 'Failed to find a valid SQL database connection value for setting "{0}".', this._sqlConnectionKey);
    protected getTreeItemLabel = () => !this._sqlConnectionKey ?
        localize('validateSQLGenericLabel', 'Validate: SQL database connection setting') :
        this._connectionType ?
            localize('validateSQLLabelWithType', 'Validate: SQL database connection setting "{0}" ({1})', this._sqlConnectionKey, this._connectionType.toLowerCase()) :
            localize('validateSQLLabel', 'Validate: SQL database connection setting "{0}"', this._sqlConnectionKey);

    private _sqlConnectionKey?: string;
    private _sqlConnectionValue?: string | undefined;
    private _connectionType?: ConnectionType;

    public async execute(context: T, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        this.options.continueOnFail = true;

        progress.report({ message: localize('checkingDTSConnection', 'Checking for DTS connection...') });

        this._sqlConnectionKey = await getSqlDbSettingsKey(context);
        this._sqlConnectionValue = await getSqlDbLocalSettingsValue(context, this._sqlConnectionKey);

        if (!this._sqlConnectionValue) {
            throw new Error();
        }

        this._connectionType = this.classifyConnectionType(this._sqlConnectionValue);
    }

    public shouldExecute(context: T): boolean {
        return context.durableStorageType === DurableBackend.DTS;
    }

    private classifyConnectionType(sqlConnection: string): ConnectionType {
        switch (true) {
            case /database\.windows\.net/i.test(sqlConnection):
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
