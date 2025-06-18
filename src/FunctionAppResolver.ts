import { type ResourceGraphClient } from "@azure/arm-resourcegraph";
import { createWebSiteClient } from "@microsoft/vscode-azext-azureappservice";
import { callWithTelemetryAndErrorHandling, nonNullProp, nonNullValueAndProp, type IActionContext, type ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { type AppResource, type AppResourceResolver } from "@microsoft/vscode-azext-utils/hostapi";
import { ResolvedFunctionAppResource } from "./tree/ResolvedFunctionAppResource";
import { ResolvedContainerizedFunctionAppResource } from "./tree/containerizedFunctionApp/ResolvedContainerizedFunctionAppResource";
import { createResourceGraphClient } from "./utils/azureClients";

export type FunctionAppModel = {
    pricingTier: string,
    id: string,
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
    kind: string,
    name: string,
    resourceGroup: string
}
export class FunctionAppResolver implements AppResourceResolver {
    private loaded: boolean = false;
    private siteCacheLastUpdated = 0;
    private siteCache: Map<string, FunctionAppModel> = new Map<string, FunctionAppModel>();
    private listFunctionAppsTask: Promise<void> | undefined;

    public async resolveResource(subContext: ISubscriptionContext, resource: AppResource): Promise<ResolvedFunctionAppResource | ResolvedContainerizedFunctionAppResource | undefined> {
        return await callWithTelemetryAndErrorHandling('resolveResource', async (context: IActionContext) => {
            if (this.siteCacheLastUpdated < Date.now() - 1000 * 3) {
                this.siteCacheLastUpdated = Date.now();
                const graphClient = await createResourceGraphClient({ ...context, ...subContext });
                async function fetchAllApps(graphClient: ResourceGraphClient, subContext: ISubscriptionContext, resolver: FunctionAppResolver): Promise<void> {
                    resolver.loaded = false;
                    resolver.siteCache.clear(); // clear the cache before fetching new data
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
                                pricingTier: data.properties.sku,
                                id: data.id,
                                kind: data.kind,
                                name: data.name,
                                resourceGroup: data.resourceGroup,
                                status: data.properties.state,
                                location: data.location
                            }
                            resolver.siteCache.set(dataModel.id.toLowerCase(), dataModel);
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

            const site = this.siteCache.get(nonNullProp(resource, 'id').toLowerCase());
            if (nonNullValueAndProp(site, 'kind') === 'functionapp,linux,container,azurecontainerapps') {
                const client = await createWebSiteClient({ ...context, ...subContext });
                const fullSite = await client.webApps.get(nonNullValueAndProp(site, 'resourceGroup'), nonNullValueAndProp(site, 'name'));
                return ResolvedContainerizedFunctionAppResource.createResolvedFunctionAppResource(context, subContext, fullSite);
            }
            if (site) {
                return new ResolvedFunctionAppResource(subContext, site);
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
