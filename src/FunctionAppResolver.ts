import { type ResourceGraphClient } from "@azure/arm-resourcegraph";
import { createWebSiteClient } from "@microsoft/vscode-azext-azureappservice";
import { callWithTelemetryAndErrorHandling, nonNullProp, nonNullValueAndProp, type IActionContext, type ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { type AppResource, type AppResourceResolver } from "@microsoft/vscode-azext-utils/hostapi";
import { ResolvedFunctionAppResource } from "./tree/ResolvedFunctionAppResource";
import { ResolvedContainerizedFunctionAppResource } from "./tree/containerizedFunctionApp/ResolvedContainerizedFunctionAppResource";
import { createResourceGraphClient } from "./utils/azureClients";
import { getGlobalSetting } from "./vsCodeConfig/settings";

export type FunctionAppModel = {
    isFlex: boolean,
    id: string,
    type: string,
    kind: string,
    name: string,
    resourceGroup: string,
    status: string,
    location: string
}

type FunctionQueryModel = {
    properties: {
        sku: string,
        state: string
    },
    location: string,
    id: string,
    type: string,
    kind: string,
    name: string,
    resourceGroup: string
}
export class FunctionAppResolver implements AppResourceResolver {
    private loaded: boolean = false;
    private siteCacheLastUpdated = 0;
    private siteCache: Map<string, FunctionAppModel> = new Map<string, FunctionAppModel>();
    private siteNameCounter: Map<string, number> = new Map<string, number>();
    private listFunctionAppsTask: Promise<void> | undefined;

    public async resolveResource(subContext: ISubscriptionContext, resource: AppResource): Promise<ResolvedFunctionAppResource | ResolvedContainerizedFunctionAppResource | undefined> {
        return await callWithTelemetryAndErrorHandling('resolveResource', async (context: IActionContext) => {
            if (this.siteCacheLastUpdated < Date.now() - 1000 * 3) {
                // do this before the graph client is created because the async graph client create takes enough time to mess up the following resolves
                this.loaded = false;
                this.siteNameCounter.clear();
                this.siteCache.clear(); // clear the cache before fetching new data
                this.siteCacheLastUpdated = Date.now();
                const graphClient = await createResourceGraphClient({ ...context, ...subContext });
                async function fetchAllApps(graphClient: ResourceGraphClient, subContext: ISubscriptionContext, resolver: FunctionAppResolver): Promise<void> {
                    const query = `resources | where type == 'microsoft.web/sites' and kind contains 'functionapp' and kind !contains 'workflowapp'`;

                    async function fetchApps(skipToken?: string): Promise<void> {
                        const response = await graphClient.resources({
                            query,
                            subscriptions: [subContext.subscriptionId],
                            options: {
                                skipToken,
                            }
                        });

                        const record = response.data as Record<string, FunctionQueryModel>;
                        Object.values(record).forEach(data => {
                            const dataModel: FunctionAppModel = {
                                isFlex: data.properties.sku.toLocaleLowerCase() === 'flexconsumption',
                                id: data.id,
                                type: data.type,
                                kind: data.kind,
                                name: data.name,
                                resourceGroup: data.resourceGroup,
                                status: data.properties.state,
                                location: data.location
                            }
                            resolver.siteCache.set(dataModel.id.toLowerCase(), dataModel);

                            const count: number = (resolver.siteNameCounter.get(dataModel.name) ?? 0) + 1;
                            resolver.siteNameCounter.set(dataModel.name, count);
                        });

                        const nextSkipToken = response?.skipToken;
                        if (nextSkipToken) {
                            await fetchApps(nextSkipToken);  // recurse to next page
                        } else {
                            resolver.loaded = true; // mark as loaded when all pages are fetched
                            return;
                        }
                    }

                    return await fetchApps();  // start with no skipToken
                }

                this.listFunctionAppsTask = fetchAllApps(graphClient, subContext, this);
            }

            while (!this.loaded) {
                // wait for the data to be loaded
                await this.listFunctionAppsTask;
            }

            const siteModel = this.siteCache.get(nonNullProp(resource, 'id').toLowerCase());
            if (nonNullValueAndProp(siteModel, 'kind') === 'functionapp,linux,container,azurecontainerapps') {
                // need the full site to resolve containerized function apps
                const client = await createWebSiteClient({ ...context, ...subContext });
                const fullSite = await client.webApps.get(nonNullValueAndProp(siteModel, 'resourceGroup'), nonNullValueAndProp(siteModel, 'name'));
                return ResolvedContainerizedFunctionAppResource.createResolvedFunctionAppResource(context, subContext, fullSite);
            }
            if (siteModel) {
                const groupBySetting: string | undefined = getGlobalSetting<string>('groupBy', 'azureResourceGroups');
                return new ResolvedFunctionAppResource(subContext, undefined, siteModel, {
                    // Multiple sites with the same name could be displayed as long as they are in different locations
                    // To help distinguish these apps for our users, lookahead and determine if the location should be provided for duplicated site names
                    showLocationAsTreeItemDescription: groupBySetting === 'resourceType' && (this.siteNameCounter.get(siteModel.name) ?? 1) > 1,
                });
            }

            return undefined;
        });
    }

    public matchesResource(resource: AppResource): boolean {
        return resource.type.toLowerCase() === 'microsoft.web/sites'
            && !!resource.kind?.includes('functionapp')
            && !resource.kind?.includes('workflowapp'); // exclude logic apps
    }
}
