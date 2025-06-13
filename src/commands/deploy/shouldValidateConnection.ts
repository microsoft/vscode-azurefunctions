import { type StringDictionary } from "@azure/arm-appservice";
import { type SiteClient } from "@microsoft/vscode-azext-azureappservice";
import { ConnectionKey, DurableBackend, type DurableBackendValues } from "../../constants";
import { getEventHubName } from "../appSettings/connectionSettings/eventHubs/validateEventHubsConnection";

type ShouldValidateConnections = {
    shouldValidateEventHubs: boolean;
    shouldValidateSqlDb: boolean;
}

export async function shouldValidateConnections(durableStorageType: DurableBackendValues | undefined, client: SiteClient, projectPath: string): Promise<ShouldValidateConnections> {
    const app: StringDictionary = await client.listApplicationSettings();

    // Event Hubs
    const remoteEventHubsConnection: string | undefined = app?.properties?.[ConnectionKey.EventHubs];
    const eventHubName: string | undefined = await getEventHubName(projectPath);
    const shouldValidateEventHubs: boolean = durableStorageType === DurableBackend.Netherite && (!eventHubName || !remoteEventHubsConnection);

    // SQL
    const remoteSqlDbConnection: string | undefined = app?.properties?.[ConnectionKey.SQL];
    const shouldValidateSqlDb: boolean = durableStorageType === DurableBackend.SQL && !remoteSqlDbConnection;

    return { shouldValidateEventHubs, shouldValidateSqlDb };
}
