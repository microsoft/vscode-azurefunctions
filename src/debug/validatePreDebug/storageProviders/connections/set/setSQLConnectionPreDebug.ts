/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard, type IActionContext } from "@microsoft/vscode-azext-utils";
import { getSqlDbLocalSettingsValue, getSqlDbSettingsKey } from "../../../../../commands/appSettings/connectionSettings/sqlDatabase/getSqlDbLocalProjectConnections";
import { type ISqlDatabaseConnectionWizardContext } from "../../../../../commands/appSettings/connectionSettings/sqlDatabase/ISqlDatabaseConnectionWizardContext";
import { SqlConnectionListStep } from "../../../../../commands/appSettings/connectionSettings/sqlDatabase/SqlConnectionListStep";
import { CodeAction, ConnectionType } from "../../../../../constants";
import { localize } from "../../../../../localize";
import { createActivityContext } from "../../../../../utils/activityUtils";

export async function setSQLConnectionPreDebugIfNeeded(context: IActionContext, projectPath: string): Promise<void> {
    const projectPathContext = Object.assign(context, { projectPath });
    const sqlDbConnectionKey: string | undefined = await getSqlDbSettingsKey(Object.assign(context, { projectPath }));
    const sqlDbConnectionValue: string | undefined = await getSqlDbLocalSettingsValue(projectPathContext, sqlDbConnectionKey);

    if (sqlDbConnectionValue) {
        return;
    }

    const availableDebugConnectionTypes = new Set([ConnectionType.Azure, ConnectionType.Custom]) satisfies Set<Exclude<ConnectionType, 'Emulator'>>;

    // Todo: Use Object.assign() if we ever introduce an emulator option so we can carry over the same preference for azureWebJobsStorage
    const wizardContext: ISqlDatabaseConnectionWizardContext = {
        ...context,
        ...await createActivityContext(),
        projectPath,
        action: CodeAction.Debug,
        newSQLStorageConnectionSettingKey: sqlDbConnectionKey,
        newSQLStorageConnectionSettingValue: sqlDbConnectionValue,
    };

    const wizard: AzureWizard<ISqlDatabaseConnectionWizardContext> = new AzureWizard(wizardContext, {
        title: localize('prepareSqlDbConnectionDebug', 'Prepare SQL database debug connection'),
        promptSteps: [new SqlConnectionListStep(availableDebugConnectionTypes)],
        showLoadingPrompt: true,
    });

    await wizard.prompt();

    if (wizardContext.sqlDbConnectionType) {
        await wizard.execute();
    }
}
