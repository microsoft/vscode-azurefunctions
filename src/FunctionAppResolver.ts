import { getResourceGroupFromId } from "@microsoft/vscode-azext-azureutils";
import { callWithTelemetryAndErrorHandling, CompatabilityAppResourceResolverBase, IActionContext, ISubscriptionContext, nonNullProp } from "@microsoft/vscode-azext-utils";
import { AppResource } from "@microsoft/vscode-azext-utils/hostapi";
import { ResolvedFunctionAppResource } from "./tree/ResolvedFunctionAppResource";
import { createWebSiteClient } from "./utils/azureClients";

export class FunctionAppResolver extends CompatabilityAppResourceResolverBase {
    public async resolveResource(subContext: ISubscriptionContext, resource: AppResource): Promise<ResolvedFunctionAppResource | undefined> {
        return await callWithTelemetryAndErrorHandling('resolveResource', async (context: IActionContext) => {
            const client = await createWebSiteClient({ ...context, ...subContext });
            const rg = getResourceGroupFromId(nonNullProp(resource, 'id'));
            const name = nonNullProp(resource, 'name');

            const site = await client.webApps.get(rg, name);
            return ResolvedFunctionAppResource.createResolvedFunctionAppResource(context, subContext, site);
        });
    }

    public matchesResource(resource: AppResource): boolean {
        return resource.type.toLowerCase() === 'microsoft.web/sites'
            && !!resource.kind?.includes('functionapp')
            && !resource.kind?.includes('workflowapp'); // exclude logic apps
    }
}
