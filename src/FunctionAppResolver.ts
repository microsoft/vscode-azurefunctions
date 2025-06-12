import { type Site } from "@azure/arm-appservice";
import { getResourceGroupFromId, uiUtils } from "@microsoft/vscode-azext-azureutils";
import { callWithTelemetryAndErrorHandling, nonNullProp, nonNullValue, nonNullValueAndProp, type IActionContext, type ISubscriptionContext } from "@microsoft/vscode-azext-utils";
import { type AppResource, type AppResourceResolver } from "@microsoft/vscode-azext-utils/hostapi";
import { ResolvedFunctionAppResource } from "./tree/ResolvedFunctionAppResource";
import { ResolvedContainerizedFunctionAppResource } from "./tree/containerizedFunctionApp/ResolvedContainerizedFunctionAppResource";
import { createWebSiteClient } from "./utils/azureClients";
import { getGlobalSetting } from "./vsCodeConfig/settings";

// TODO: this is temporary until the new SDK with api-version=2023-12-01 is available
type Site20231201 = Site & { isFlex?: boolean };
export class FunctionAppResolver implements AppResourceResolver {
    private siteCacheLastUpdated = 0;
    private siteCache: Map<string, Site20231201> = new Map<string, Site20231201>();
    private siteNameCounter: Map<string, number> = new Map<string, number>();
    private listFunctionAppsTask: Promise<void> | undefined;

    public async resolveResource(subContext: ISubscriptionContext, resource: AppResource): Promise<ResolvedFunctionAppResource | ResolvedContainerizedFunctionAppResource | undefined> {
        return await callWithTelemetryAndErrorHandling('resolveResource', async (context: IActionContext) => {
            const client = await createWebSiteClient({ ...context, ...subContext });

            if (this.siteCacheLastUpdated < Date.now() - 1000 * 3) {
                this.siteCacheLastUpdated = Date.now();
                this.listFunctionAppsTask = new Promise((resolve, reject) => {
                    this.siteCache.clear();
                    this.siteNameCounter.clear();

                    uiUtils.listAllIterator(client.webApps.list()).then((sites) => {
                        for (const site of sites) {
                            const siteName: string = nonNullProp(site, 'name');
                            const count: number = (this.siteNameCounter.get(siteName) ?? 0) + 1;

                            this.siteNameCounter.set(siteName, count);
                            this.siteCache.set(nonNullProp(site, 'id').toLowerCase(), site);
                        }
                        resolve();
                    })
                        .catch((reason) => {
                            reject(reason);
                        });
                });
            }
            await this.listFunctionAppsTask;

            let site = this.siteCache.get(nonNullProp(resource, 'id').toLowerCase());
            // check for required properties that sometime don't exist in the LIST operation
            if (!site || !site.defaultHostName) {
                // if this required property doesn't exist, try getting the full site payload
                site = await client.webApps.get(getResourceGroupFromId(resource.id), resource.name);
                this.siteCache.set(resource.id.toLowerCase(), site);
            }

            if (nonNullValueAndProp(site, 'kind') === 'functionapp,linux,container,azurecontainerapps') {
                const fullSite = await client.webApps.get(nonNullValueAndProp(site, 'resourceGroup'), nonNullValueAndProp(site, 'name'));
                return ResolvedContainerizedFunctionAppResource.createResolvedFunctionAppResource(context, subContext, fullSite);
            }

            const groupBy: string | undefined = getGlobalSetting<string>('groupBy', 'azureResourceGroups');
            return ResolvedFunctionAppResource.createResolvedFunctionAppResource(context, subContext, nonNullValue(site), {
                // Multiple sites with the same name could be displayed as long as they are in different locations
                // To help distinguish these apps for our users, lookahead and determine if the location should be provided for duplicated site names
                showLocationAsTreeItemDescription: groupBy === 'resourceType' && (this.siteNameCounter.get(nonNullValueAndProp(site, 'name')) ?? 1) > 1,
            });
        });
    }

    public matchesResource(resource: AppResource): boolean {
        return resource.type.toLowerCase() === 'microsoft.web/sites'
            && !!resource.kind?.includes('functionapp')
            && !resource.kind?.includes('workflowapp'); // exclude logic apps
    }
}
