/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, AzureWizardExecuteStep, nonNullProp } from '@microsoft/vscode-azext-utils';
import * as path from "path";
import { CodeAction, hostFileName } from '../../../../constants';
import { type IHostJsonV2, type ISqlTaskJson } from '../../../../funcConfig/host';
import { localize } from '../../../../localize';
import { notifyFailedToConfigureHost } from '../notifyFailedToConfigureHost';
import { setLocalSetting } from '../setConnectionSetting';
import { type ISqlDatabaseConnectionWizardContext } from './ISqlDatabaseConnectionWizardContext';

export class SqlDbConnectionSetSettingStep<T extends ISqlDatabaseConnectionWizardContext> extends AzureWizardExecuteStep<T> {
    public priority: number = 250;

    public async execute(context: T): Promise<void> {
        if (!context.newSQLStorageConnectionSettingKey) {
            const defaultSqlConnectionName: string = 'SQLDB_Connection';
            await this.configureHostJson(context, defaultSqlConnectionName);
            context.newSQLStorageConnectionSettingKey = defaultSqlConnectionName;
        }

        if (context.action === CodeAction.Debug) {
            await setLocalSetting(
                context,
                nonNullProp(context, 'newSQLStorageConnectionSettingKey'),
                nonNullProp(context, 'newSQLStorageConnectionSettingValue'),
            );
        } else {
            // No further action required
        }
    }

    public shouldExecute(context: T): boolean {
        return !!context.newSQLStorageConnectionSettingValue;
    }

    private async configureHostJson(context: T, connectionStringName: string) {
        const hostJsonPath: string = path.join(context.projectPath, hostFileName);

        if (!await AzExtFsExtra.pathExists(hostJsonPath)) {
            context.telemetry.properties.sqlDbHostConfigFailed = 'true';
            const message: string = localize('sqlDbHostConfigFailed', 'Unable to find and configure "{0}" in your project root. You may need to configure your SQL connection string settings manually.', hostFileName);
            notifyFailedToConfigureHost(context, message);
            return;
        }

        const hostJson: IHostJsonV2 = await AzExtFsExtra.readJSON(hostJsonPath) as IHostJsonV2;
        hostJson.extensions ??= {};
        hostJson.extensions.durableTask ??= {};

        const durableTask = hostJson.extensions.durableTask as ISqlTaskJson;
        durableTask.storageProvider ??= {};
        durableTask.storageProvider.connectionStringName = connectionStringName;

        await AzExtFsExtra.writeJSON(hostJsonPath, hostJson);
    }
}
