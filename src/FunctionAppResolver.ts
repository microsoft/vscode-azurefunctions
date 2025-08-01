import { type ResourceGraphClient } from "@azure/arm-resourcegraph";
import { createWebSiteClient } from "@microsoft/vscode-azext-azureappservice";
import { getResourceGroupFromId } from "@microsoft/vscode-azext-azureutils";
import { callWithTelemetryAndErrorHandling, nonNullProp, type IActionContext, type ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { type AppResource, type AppResourceResolver } from "@microsoft/vscode-azext-utils/hostapi";
import { ResolvedFunctionAppResource } from "./tree/ResolvedFunctionAppResource";
import { ResolvedContainerizedFunctionAppResource } from "./tree/containerizedFunctionApp/ResolvedContainerizedFunctionAppResource";
import { createResourceGraphClient } from "./utils/azureClients";

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
    private listFunctionAppsTask: Promise<void> | undefined;

    public async resolveResource(subContext: ISubscriptionContext, resource: AppResource): Promise<ResolvedFunctionAppResource | ResolvedContainerizedFunctionAppResource | undefined> {
        return await callWithTelemetryAndErrorHandling('resolveResource', async (context: IActionContext) => {
            context.errorHandling.rethrow = true; // rethrow errors to ensure it bubbles up to the resolver
            if (this.siteCacheLastUpdated < Date.now() - 1000 * 3) {
                // do this before the graph client is created because the async graph client create takes enough time to mess up the following resolves
                this.loaded = false;
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
                        // seems as if properties can be null, so we need to check for that
                        Object.values(record).forEach(data => {
                            const dataModel: FunctionAppModel = {
                                isFlex: data.properties?.sku?.toLocaleLowerCase() === 'flexconsumption',
                                id: data.id,
                                type: data.type,
                                kind: data.kind,
                                name: data.name,
                                resourceGroup: data.resourceGroup,
                                status: data.properties?.state,
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

            const siteModel = this.siteCache.get(nonNullProp(resource, 'id').toLowerCase());
            if (!siteModel || siteModel.kind === 'functionapp,linux,container,azurecontainerapps') {
                // if the site model is not found or if it's a containerized function app, we need the full site details
                const client = await createWebSiteClient({ ...context, ...subContext });
                const fullSite = await client.webApps.get(getResourceGroupFromId(resource.id), resource.name);
                if (fullSite.kind === 'functionapp,linux,container,azurecontainerapps') {
                    return ResolvedContainerizedFunctionAppResource.createResolvedFunctionAppResource(context, subContext, fullSite);
                }

                return new ResolvedFunctionAppResource(subContext, fullSite);
            } else if (siteModel) {
                return new ResolvedFunctionAppResource(subContext, undefined, siteModel);
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
