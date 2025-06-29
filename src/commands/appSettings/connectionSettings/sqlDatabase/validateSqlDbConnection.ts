/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizard } from "@microsoft/vscode-azext-utils";
import { CodeAction, ConnectionKey } from "../../../../constants";
import { getLocalSettingsConnectionString } from "../../../../funcConfig/local.settings";
import { SqlDatabaseListStep } from "../../../createFunction/durableSteps/sql/SqlDatabaseListStep";
import { type IConnectionPromptOptions } from "../IConnectionPromptOptions";
import { type ISetConnectionSettingContext } from "../ISetConnectionSettingContext";
import { type INetheriteConnectionWizardContext } from "../netherite/INetheriteConnectionWizardContext";
import { type ISqlDatabaseConnectionWizardContext } from "./ISqlDatabaseConnectionWizardContext";
import { SqlDatabaseConnectionExecuteStep } from "./SqlDatabaseConnectionExecuteStep";
import { SqlDatabaseConnectionPromptStep } from "./SqlDatabaseConnectionPromptStep";

// Supports validation on both 'debug' and 'deploy'
export async function validateSqlDbConnection(context: Omit<ISetConnectionSettingContext, 'projectPath'>, projectPath: string, options?: IConnectionPromptOptions): Promise<void> {
    const sqlDbConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.SQL, projectPath);

    if (sqlDbConnection) {
        if (context.action === CodeAction.Deploy) {
            // Found a valid connection in deploy mode. Set it for deploy.
            context[ConnectionKey.SQL] = sqlDbConnection;
        }
        // Found a valid connection in debug or deploy mode. Skip the wizard.
        return;
    }

    const wizardContext: ISqlDatabaseConnectionWizardContext = Object.assign(context, { projectPath });
    const wizard: AzureWizard<INetheriteConnectionWizardContext> = new AzureWizard(wizardContext, {
        promptSteps: [new SqlDatabaseConnectionPromptStep(options), new SqlDatabaseListStep()],
        executeSteps: [new SqlDatabaseConnectionExecuteStep()]
    });
    await wizard.prompt();
    await wizard.execute();
}
