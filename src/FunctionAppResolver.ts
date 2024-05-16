import { type Site } from "@azure/arm-appservice";
import { createHttpHeaders, createPipelineRequest } from "@azure/core-rest-pipeline";
import { createGenericClient, uiUtils, type AzExtPipelineResponse, type AzExtRequestPrepareOptions } from "@microsoft/vscode-azext-azureutils";
import { callWithTelemetryAndErrorHandling, nonNullProp, nonNullValue, nonNullValueAndProp, type IActionContext, type ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { type AppResource, type AppResourceResolver } from "@microsoft/vscode-azext-utils/hostapi";
import { type FunctionAppConfig } from "./commands/createFunctionApp/FunctionAppCreateStep";
import { ResolvedFunctionAppResource } from "./tree/ResolvedFunctionAppResource";
import { ResolvedContainerizedFunctionAppResource } from "./tree/containerizedFunctionApp/ResolvedContainerizedFunctionAppResource";
import { createWebSiteClient } from "./utils/azureClients";

// TODO: this is temporary until the new SDK with api-version=2023-12-01 is available
type Site20231201 = Site & { isFlex?: boolean };
export class FunctionAppResolver implements AppResourceResolver {
    private siteCacheLastUpdated = 0;
    private siteCache: Map<string, Site20231201> = new Map<string, Site20231201>();

    public async resolveResource(subContext: ISubscriptionContext, resource: AppResource): Promise<ResolvedFunctionAppResource | ResolvedContainerizedFunctionAppResource | undefined> {
        return await callWithTelemetryAndErrorHandling('resolveResource', async (context: IActionContext) => {
            const client = await createWebSiteClient({ ...context, ...subContext });

            if (this.siteCacheLastUpdated < Date.now() - 1000 * 3) {
                this.siteCache.clear();
                const sites = await uiUtils.listAllIterator(client.webApps.list());
                const sites20231201 = await getSites20231201(context, subContext);
                await Promise.all(sites.map(async (site): Promise<void> => {
                    const id = nonNullProp(site, 'id').toLowerCase();
                    const s = sites20231201.find(s => s.id?.toLowerCase() === site.id?.toLowerCase());
                    this.siteCache.set(id, Object.assign(site, { isFlex: !!s?.properties?.functionAppConfig }));

                    if (!site.defaultHostName) {
                        // if this required property doesn't exist, try getting the full site payload
                        const fullSite = await client.webApps.get(nonNullProp(site, 'resourceGroup'), nonNullProp(site, 'name'))
                        this.siteCache.set(id, fullSite);
                    }
                }));
                this.siteCacheLastUpdated = Date.now();
            }

            const site = this.siteCache.get(nonNullProp(resource, 'id').toLowerCase());

            if (nonNullValueAndProp(site, 'kind') === 'functionapp,linux,container,azurecontainerapps') {
                const fullSite = await client.webApps.get(nonNullValueAndProp(site, 'resourceGroup'), nonNullValueAndProp(site, 'name'));
                return ResolvedContainerizedFunctionAppResource.createResolvedFunctionAppResource(context, subContext, fullSite);
            }

            return ResolvedFunctionAppResource.createResolvedFunctionAppResource(context, subContext, nonNullValue(site), site?.isFlex);
        });
    }

    public matchesResource(resource: AppResource): boolean {
        return resource.type.toLowerCase() === 'microsoft.web/sites'
            && !!resource.kind?.includes('functionapp')
            && !resource.kind?.includes('workflowapp'); // exclude logic apps
    }
}

async function getSites20231201(context: IActionContext, subContext: ISubscriptionContext): Promise<(Site & { properties?: { functionAppConfig: FunctionAppConfig } })[]> {
    try {
        const headers = createHttpHeaders({
            'Content-Type': 'application/json',
        });

        const armEndpoint = ensureEndingSlash(subContext.environment.resourceManagerEndpointUrl);

        // we need the new api-version to get the functionAppConfig
        const options: AzExtRequestPrepareOptions = {
            url: `${armEndpoint}subscriptions/${subContext.subscriptionId}/providers/Microsoft.Web/sites?api-version=2023-12-01`,
            method: 'GET',
            headers
        };

        const client = await createGenericClient(context, subContext);
        const result = await client.sendRequest(createPipelineRequest(options)) as AzExtPipelineResponse;

        return (result.parsedBody as { value: unknown }).value as (Site & { properties?: { functionAppConfig: FunctionAppConfig } })[] ?? [];
    } catch (_error) {
        return [];
    }
}

function ensureEndingSlash(url: string): string {
    return url.endsWith('/') ? url : `${url}/`;
}
