import { type StringDictionary } from "@azure/arm-appservice";
import { type SiteClient } from "@microsoft/vscode-azext-azureappservice";
import { ConnectionKey, DurableBackend } from "../../constants";
import { getEventHubName } from "../appSettings/connectionSettings/eventHubs/validateEventHubsConnection";

export interface IShouldValidateConnection {
    shouldValidateEventHubs: boolean;
    shouldValidateSqlDb: boolean;
}

export async function shouldValidateConnections(durableStorageType: DurableBackend | undefined, client: SiteClient, projectPath: string): Promise<IShouldValidateConnection> {
    const app: StringDictionary = await client.listApplicationSettings();
    const remoteEventHubsConnection: string | undefined = app?.properties?.[ConnectionKey.EventHubs];
    const remoteSqlDbConnection: string | undefined = app?.properties?.[ConnectionKey.SQL];
    const eventHubName: string | undefined = await getEventHubName(projectPath);

    const shouldValidateEventHubs: boolean = durableStorageType === DurableBackend.Netherite && (!eventHubName || !remoteEventHubsConnection);
    const shouldValidateSqlDb: boolean = durableStorageType === DurableBackend.SQL && !remoteSqlDbConnection;
    return { shouldValidateEventHubs, shouldValidateSqlDb };
}
