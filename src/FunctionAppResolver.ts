import { type Site } from "@azure/arm-appservice";
import { uiUtils } from "@microsoft/vscode-azext-azureutils";
import { callWithTelemetryAndErrorHandling, nonNullProp, nonNullValue, nonNullValueAndProp, type IActionContext, type ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { type AppResource, type AppResourceResolver } from "@microsoft/vscode-azext-utils/hostapi";
import { ResolvedFunctionAppResource } from "./tree/ResolvedFunctionAppResource";
import { ResolvedContainerizedFunctionAppResource } from "./tree/containerizedFunctionApp/ResolvedContainerizedFunctionAppResourceBase";
import { createWebSiteClient } from "./utils/azureClients";

export class FunctionAppResolver implements AppResourceResolver {
    private siteCacheLastUpdated = 0;
    private siteCache: Map<string, Site> = new Map<string, Site>();

    public async resolveResource(subContext: ISubscriptionContext, resource: AppResource): Promise<ResolvedFunctionAppResource | ResolvedContainerizedFunctionAppResource | undefined> {
        return await callWithTelemetryAndErrorHandling('resolveResource', async (context: IActionContext) => {
            const client = await createWebSiteClient({ ...context, ...subContext });

            if (this.siteCacheLastUpdated < Date.now() - 1000 * 3) {
                this.siteCache.clear();
                const sites = await uiUtils.listAllIterator(client.webApps.list());
                sites.forEach(site => this.siteCache.set(nonNullProp(site, 'id').toLowerCase(), site));
                this.siteCacheLastUpdated = Date.now();
            }

            const site = this.siteCache.get(nonNullProp(resource, 'id').toLowerCase());

            if (nonNullValueAndProp(site, 'kind') === 'functionapp,linux,container,azurecontainerapps') {
                return ResolvedContainerizedFunctionAppResource.createResolvedFunctionAppResource(context, subContext, nonNullValue(site));
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

