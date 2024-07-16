import { type Site } from "@azure/arm-appservice";
import { getResourceGroupFromId, uiUtils } from "@microsoft/vscode-azext-azureutils";
import { callWithTelemetryAndErrorHandling, nonNullProp, nonNullValue, nonNullValueAndProp, type IActionContext, type ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { type AppResource, type AppResourceResolver } from "@microsoft/vscode-azext-utils/hostapi";
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
                for (const site of sites) {
                    this.siteCache.set(resource.id, site);
                    this.siteCacheLastUpdated = Date.now();
                }
            }

            let site = this.siteCache.get(nonNullProp(resource, 'id').toLowerCase());
            // check for required properties that sometime don't exist in the LIST operation
            if (!site || !site.defaultHostName) {
                // if this required property doesn't exist, try getting the full site payload
                site = await client.webApps.get(getResourceGroupFromId(resource.id), resource.name);
                this.siteCache.set(resource.id, site);
            }

            if (nonNullValueAndProp(site, 'kind') === 'functionapp,linux,container,azurecontainerapps') {
                const fullSite = await client.webApps.get(nonNullValueAndProp(site, 'resourceGroup'), nonNullValueAndProp(site, 'name'));
                return ResolvedContainerizedFunctionAppResource.createResolvedFunctionAppResource(context, subContext, fullSite);
            }

            return ResolvedFunctionAppResource.createResolvedFunctionAppResource(context, subContext, nonNullValue(site));
        });
    }

    public matchesResource(resource: AppResource): boolean {
        return resource.type.toLowerCase() === 'microsoft.web/sites'
            && !!resource.kind?.includes('functionapp')
            && !resource.kind?.includes('workflowapp'); // exclude logic apps
    }
}
