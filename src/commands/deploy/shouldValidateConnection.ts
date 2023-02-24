import type { StringDictionary } from "@azure/arm-appservice";
import type { SiteClient } from "@microsoft/vscode-azext-azureappservice";
import { ConnectionKey, DurableBackend, DurableBackendValues } from "../../constants";
import { getEventHubName } from "../appSettings/connectionSettings/eventHubs/validateEventHubsConnection";

export interface IShouldValidateConnection {
    shouldValidateStorage: boolean;
    shouldValidateEventHubs: boolean;
    shouldValidateSqlDb: boolean;
}

export async function shouldValidateConnections(durableStorageType: DurableBackendValues | undefined, client: SiteClient, projectPath: string): Promise<IShouldValidateConnection> {
    const app: StringDictionary = await client.listApplicationSettings();
    const remoteStorageConnection: string | undefined = app?.properties?.[ConnectionKey.Storage];
    const remoteEventHubsConnection: string | undefined = app?.properties?.[ConnectionKey.EventHubs];
    const remoteSqlDbConnection: string | undefined = app?.properties?.[ConnectionKey.SQL];
    const eventHubName: string | undefined = await getEventHubName(projectPath);

    const shouldValidateStorage: boolean = !remoteStorageConnection;
    const shouldValidateEventHubs: boolean = durableStorageType === DurableBackend.Netherite && (!eventHubName || !remoteEventHubsConnection);
    const shouldValidateSqlDb: boolean = durableStorageType === DurableBackend.SQL && !remoteSqlDbConnection;
    return { shouldValidateStorage, shouldValidateEventHubs, shouldValidateSqlDb };
}
