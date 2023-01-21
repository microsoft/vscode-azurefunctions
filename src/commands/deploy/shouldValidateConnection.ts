import type { StringDictionary } from "@azure/arm-appservice";
import type { SiteClient } from "@microsoft/vscode-azext-azureappservice";
import { IActionContext } from "@microsoft/vscode-azext-utils";
import * as vscode from "vscode";
import { ConnectionKey, ConnectionKeyValues, DurableBackend, DurableBackendValues, localEventHubsEmulatorConnectionRegExp, localStorageEmulatorConnectionString } from "../../constants";
import { getLocalSettingsConnectionString } from "../../funcConfig/local.settings";
import { localize } from "../../localize";
import { netheriteUtils } from "../../utils/durableUtils";

export interface IShouldValidateConnection {
    shouldValidateStorage: boolean;
    shouldValidateEventHubs: boolean;
    shouldValidateSqlDb: boolean;
}

/*
 * This function checks to see if additional validation will be required for each connection string before deployment.
 *
 * In general, most of the logic here boils down to the following cases.
 * Case 1: No remote connection exists for a required resource.  shouldValidate returns true.
 * Case 2: A remote connection already exists, but there is also a valid local settings connection detected in 'local.settings.json' that could potentially replace it.
 * In this case, prompt the user to determine if they would like to overwrite.  If yes, shouldValidate returns true.
 */
export async function shouldValidateConnections(context: IActionContext, durableStorageType: DurableBackendValues | undefined, client: SiteClient, projectPath: string): Promise<IShouldValidateConnection> {
    const app: StringDictionary = await client.listApplicationSettings();
    const remoteStorageConnection: string | undefined = app?.properties?.[ConnectionKey.Storage];
    const remoteEventHubsConnection: string | undefined = app?.properties?.[ConnectionKey.EventHubs];
    const remoteSqlDbConnection: string | undefined = app?.properties?.[ConnectionKey.SQL];

    const localStorageConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.Storage, projectPath);
    const localEventHubsConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.EventHubs, projectPath);
    const localSqlDbConnection: string | undefined = await getLocalSettingsConnectionString(context, ConnectionKey.SQL, projectPath);

    const netheriteHubName: string | undefined = await netheriteUtils.getEventHubName(projectPath);

    const shouldValidateStorage: boolean = !remoteStorageConnection ||
        (!!localStorageConnection &&
            localStorageConnection !== localStorageEmulatorConnectionString &&
            remoteStorageConnection !== localStorageConnection &&
            await promptShouldOverwrite(context, ConnectionKey.Storage));

    const shouldValidateEventHubs: boolean = durableStorageType === DurableBackend.Netherite &&
        !netheriteHubName ||
        (!remoteEventHubsConnection ||
            (!!localEventHubsConnection &&
                !localEventHubsEmulatorConnectionRegExp.test(localEventHubsConnection) &&
                remoteEventHubsConnection !== localEventHubsConnection &&
                await promptShouldOverwrite(context, ConnectionKey.EventHubs)));

    const shouldValidateSqlDb: boolean = durableStorageType === DurableBackend.SQL &&
        (!remoteSqlDbConnection ||
            (!!localSqlDbConnection &&
                remoteSqlDbConnection !== localSqlDbConnection &&
                await promptShouldOverwrite(context, ConnectionKey.SQL)));

    return { shouldValidateStorage, shouldValidateEventHubs, shouldValidateSqlDb };
}

async function promptShouldOverwrite(context: IActionContext, key: ConnectionKeyValues): Promise<boolean> {
    const overwriteButton: vscode.MessageItem = { title: localize('overwrite', 'Overwrite') };
    const skipButton: vscode.MessageItem = { title: localize('skip', 'Skip') };
    const buttons: vscode.MessageItem[] = [overwriteButton, skipButton];

    const message: string = localize('overwriteRemoteConnection', 'We detected a different local connection setting for "{0}" than what was previously used. Would you like to overwrite your remote setting?', key);

    const result: vscode.MessageItem = await context.ui.showWarningMessage(message, { modal: true }, ...buttons);
    return result === overwriteButton;
}
