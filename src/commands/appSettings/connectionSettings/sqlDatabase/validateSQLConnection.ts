/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type StringDictionary } from "@azure/arm-appservice";
import { type ParsedSite } from "@microsoft/vscode-azext-azureappservice";
import { LocationListStep } from "@microsoft/vscode-azext-azureutils";
import { AzureWizard, type ISubscriptionActionContext } from "@microsoft/vscode-azext-utils";
import { CodeAction, ConnectionType } from "../../../../constants";
import { localize } from "../../../../localize";
import { createActivityContext } from "../../../../utils/activityUtils";
import { type IFuncDeployContext } from "../../../deploy/deploy";
import { type ISqlDbConnectionSetSettingsContext } from "../ISetConnectionSettingContext";
import { type ISqlDatabaseAzureConnectionWizardContext } from "./ISqlDatabaseConnectionWizardContext";
import { SqlConnectionListStep } from "./SqlConnectionListStep";
import { getSqlDbLocalSettingsValue, getSqlDbSettingsKey } from "./getSqlDbLocalProjectConnections";

type SqlConnectionContext = IFuncDeployContext & ISubscriptionActionContext;

/**
 * A pre-flight deployment operation that ensures that:
 *
 * a) Remote SQL connections already exist for the given function app or
 *
 * b) That new SQL resources are created and ready for connection to the function app
 */
export async function validateSQLConnection(context: SqlConnectionContext, appSettings: StringDictionary, site: ParsedSite, projectPath: string): Promise<ISqlDbConnectionSetSettingsContext | undefined> {
    const sqlDbConnectionKey: string | undefined = await getSqlDbSettingsKey(Object.assign(context, { projectPath }));
    const remoteSqlDbConnection: string | undefined = sqlDbConnectionKey ? appSettings?.properties?.[sqlDbConnectionKey] : undefined;

    if (remoteSqlDbConnection) {
        return undefined;
    }

    const localSqlDbConnection: string | undefined = await getSqlDbLocalSettingsValue(context, sqlDbConnectionKey);
    const { serverName, dbName } = parseSqlResourceNames(localSqlDbConnection);

    const availableDeployConnectionTypes = new Set([ConnectionType.Azure, ConnectionType.Custom]) satisfies Set<Exclude<ConnectionType, 'Emulator'>>;

    const wizardContext: ISqlDatabaseAzureConnectionWizardContext = {
        ...context,
        ...await createActivityContext(),
        projectPath,
        action: CodeAction.Deploy,
        suggestedSqlServerLocalSettings: serverName,
        suggestedSqlDbLocalSettings: dbName,
        newSQLStorageConnectionSettingKey: sqlDbConnectionKey,
        newSQLStorageConnectionSettingValue: remoteSqlDbConnection,
    };

    LocationListStep.resetLocation(wizardContext);
    await LocationListStep.setAutoSelectLocation(wizardContext, site.location);

    const wizard: AzureWizard<ISqlDatabaseAzureConnectionWizardContext> = new AzureWizard(wizardContext, {
        title: localize('prepareSqlDbConnection', 'Prepare SQL database deployment connection'),
        promptSteps: [new SqlConnectionListStep(availableDeployConnectionTypes)],
        showLoadingPrompt: true,
    });

    await wizard.prompt();

    if (wizardContext.sqlDbConnectionType) {
        await wizard.execute();
    }

    return {
        newSQLStorageConnectionSettingKey: wizardContext.newSQLStorageConnectionSettingKey,
        newSQLStorageConnectionSettingValue: wizardContext.newSQLStorageConnectionSettingValue,
    };
}

export function parseSqlResourceNames(sqlDbConnection?: string): { serverName?: string; dbName?: string } {
    if (!sqlDbConnection) {
        return {};
    }

    // Connection example: Server=tcp:myserver.database.windows.net,1433;Database=mydb;...
    const serverMatch = sqlDbConnection.match(/Server=(?:tcp:)?([^;\s,]+)/i);
    const dbMatch = sqlDbConnection.match(/Database=([^;\s]+)/i);

    const serverDomainName = serverMatch ? serverMatch[1] : undefined;
    const dbName = dbMatch ? dbMatch[1] : undefined;

    return {
        serverName: serverDomainName ? serverDomainName.split('.')[0] : undefined,
        dbName,
    };
}
