/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthorizationManagementClient, type RoleAssignment, type RoleDefinition } from '@azure/arm-authorization';
import { ResourceManagementClient, type GenericResourceExpanded } from '@azure/arm-resources';
import { AzExtParentTreeItem, createContextValue, type AzExtTreeItem, type IActionContext } from '@microsoft/vscode-azext-utils';
import { localize } from '../../localize';
import { type IProjectTreeItem } from '../IProjectTreeItem';
import { getProjectContextValue, ProjectAccess, ProjectResource } from '../projectContextValues';
import { type SlotTreeItem } from '../SlotTreeItem';
import { type ManagedIdentity } from './ManagedIdentitiesTreeItem';
import { RoleAccessScopeTreeItem } from './RoleAccessScopeTreeItem';

export abstract class RoleAccessTreeItemBase extends AzExtParentTreeItem {
    public readonly label: string = localize('RoleAccess', 'Role Access');
    public readonly childTypeLabel: string = localize('roleAccess', 'Role Access');
    public parent: AzExtParentTreeItem & IProjectTreeItem;
    public suppressMaskLabel: boolean = true;

    public abstract isReadOnly: boolean;

    public constructor(parent: AzExtParentTreeItem & IProjectTreeItem) {
        super(parent);
    }

    public get contextValue(): string {
        const contextValue = createContextValue([getProjectContextValue(this.parent.source, this.access, ProjectResource.Identities), 'assignNewRoleAccess']);
        return contextValue;
    }

    public get description(): string {
        return '';
    }

    public get access(): ProjectAccess {
        return this.isReadOnly ? ProjectAccess.ReadOnly : ProjectAccess.ReadWrite;
    }

    public get id(): string {
        return 'roleAccess';
    }

    // public get iconPath(): TreeItemIconPath {
    //     return new ThemeIcon('key');
    // }

}

export enum ScopeType {
    ResourceGroup = 'ResourceGroup',
    Subscription = 'Subscription',
    Resource = 'Resource'
}

export interface RoleAccess extends RoleAssignment {
    scopeType?: ScopeType;
    resourceName?: string;
    resourceType?: string;
    roleName?: string;
    roleDescription?: string;
    principalName?: string;
}

export class RoleAccessTreeItem extends RoleAccessTreeItemBase {
    public readonly parent: SlotTreeItem;
    public isReadOnly: boolean;
    private _nextLink: string | undefined;


    private constructor(parent: SlotTreeItem) {
        super(parent);
    }

    public static async createRoleAccessTreeItem(context: IActionContext, parent: SlotTreeItem): Promise<RoleAccessTreeItem> {
        const ti: RoleAccessTreeItem = new RoleAccessTreeItem(parent);
        // initialize
        await ti.initAsync(context);
        return ti;
    }

    public async initAsync(context: IActionContext): Promise<void> {
        this.isReadOnly = await this.parent.isReadOnly(context);
    }

    public async refreshImpl(context: IActionContext): Promise<void> {
        await this.initAsync(context);
        await this.loadAllChildren(context);
    }

    public hasMoreChildrenImpl(): boolean {
        return !!this._nextLink;
    }

    public async loadMoreChildrenImpl(clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        // Get all resources in a subscription
        const resourceClient = new ResourceManagementClient(this.parent.site.subscription.credentials, this.parent.site.subscription.subscriptionId);
        const resources: GenericResourceExpanded[] = [];
        for await (const resource of resourceClient.resources.list()) {
            resources.push(resource);
        }
        console.log(`FOUND RESOURCES:`);
        console.log(resources);

        // // 1. Find this current app's resource
        // const myResource = resources.find(resource => resource.id === this.parent.site.id);
        const myIdentity = this.parent.site.rawSite.identity;
        const identities: ManagedIdentity[] = [];
        if (myIdentity) {
            if (myIdentity.type?.includes('SystemAssigned')) {
                const systemAssignedManagedIdentity: ManagedIdentity = {
                    type: 'SystemAssigned',
                    principalId: myIdentity.principalId,
                    tenantId: myIdentity.tenantId,
                    resourceId: this.parent.site.id,
                    name: this.parent.site.fullName,
                }
                identities.push(systemAssignedManagedIdentity);
            }
            if (myIdentity.type?.includes('UserAssigned')) {
                for (const [identityId, identityValue] of Object.entries(myIdentity.userAssignedIdentities || {})) {
                    identities.push({
                        type: 'UserAssigned',
                        resourceId: identityId,
                        name: resources.filter(resource => resource.id?.toLowerCase() === identityId.toLowerCase())[0]?.name,
                        ...identityValue,
                    });
                }
            }

        }

        console.log(`FOUND IDENTITIES:`);
        console.log(identities);

        const identityPrincipalIds = identities.map(identity => identity.principalId);

        // Loop over each resource
        const authClient = new AuthorizationManagementClient(this.parent.site.subscription.credentials, this.parent.site.subscription.subscriptionId);
        const roleAssignments: RoleAssignment[] = [];
        const roleAssignmentsIter = authClient.roleAssignments.listForSubscription();
        while (true) {
            const assignment = await roleAssignmentsIter.next();
            if (assignment.done) {
                break;
            }
            roleAssignments.push(assignment.value);
        }

        const relevantAssignments = roleAssignments.filter(assignment => identityPrincipalIds.includes(assignment.principalId));

        const roleAccess: RoleAccess[] = await Promise.all(relevantAssignments.map(async assignment => {
            let resourceType: string | undefined = undefined;
            let resourceName: string | undefined = undefined;
            let scopeType: ScopeType | undefined = undefined;
            if (assignment.scope) {
                const scopeParts = assignment.scope.split('/');
                if (scopeParts.length >= 9) {
                    scopeType = ScopeType.Resource;
                    resourceName = scopeParts[8];
                    resourceType = `${scopeParts[6]}/${scopeParts[7]}`;
                } else if (scopeParts.length >= 5 && scopeParts[3] === 'resourceGroups') {
                    scopeType = ScopeType.ResourceGroup;
                    resourceName = scopeParts[4];
                    resourceType = 'resourceGroups';
                } else if (scopeParts.length >= 3 && scopeParts[1] === 'subscriptions') {
                    scopeType = ScopeType.Subscription;
                    resourceName = scopeParts[2];
                    resourceType = 'subscriptions';
                }
            }
            const principalName: string | undefined = identities.find(identity => identity.principalId === assignment.principalId)?.name;
            let roleName: string | undefined = undefined;
            let roleDescription: string | undefined = undefined;

            if (assignment.roleDefinitionId) {
                const roleDefinition: RoleDefinition = await authClient.roleDefinitions.getById(assignment.roleDefinitionId);
                console.log(`TEST: FOUND ROLE DEFINITION:`);
                console.log(roleDefinition)
                roleName = roleDefinition.roleName;
                roleDescription = roleDefinition.description;
            }

            return {
                ...assignment,
                scopeType,
                resourceName,
                resourceType,
                principalName,
                roleName,
                roleDescription,
            }
        }));

        console.log(`FOUND ROLE ACCESS:`);
        console.log(roleAccess);

        // Group roleAccess by scope
        const groupedByScope: { [key: string]: RoleAccess[] } = roleAccess.reduce((acc: { [key: string]: RoleAccess[] }, current: RoleAccess) => {
            const scope: string = current.scope || current.resourceName || 'Unknown';
            if (!acc[scope]) {
                acc[scope] = [current];
            } else {
                acc[scope].push(current);
            }
            return acc;
        }, {});

        console.log(`GROUPED BY SCOPE:`);
        console.log(groupedByScope);

        const roleAccessItems = Object.entries(groupedByScope);


        // // Get all user-assigned managed identities
        // const userAssignedManagedIdentities = resources.filter(resource => {
        //     return resource.type === 'Microsoft.ManagedIdentity/userAssignedIdentities';
        // });

        // console.log(`FOUND USER ASSIGNED MANAGED IDENTITIES:`);
        // console.log(userAssignedManagedIdentities);


        // /*
        //     Related to issue: https://github.com/microsoft/vscode-azurefunctions/issues/3179
        //     Sometimes receive a 'BadGateway' error on initial fetch, but consecutive re-fetching usually fixes the issue.
        //     Under these circumstances, we will attempt to do the call 3 times during warmup before throwing the error.
        // */
        // const client = new AuthorizationManagementClient(this.parent.site.subscription.credentials, this.parent.site.subscription.subscriptionId);
        // const roleAssignmentsIter = client.roleAssignments.listForScope(this.parent.site.id);
        // const roleAssignments: RoleAssignment[] = [];
        // while (true) {
        //     const assignment = await roleAssignmentsIter.next();
        //     if (assignment.done) {
        //         break;
        //     }
        //     roleAssignments.push(assignment.value);
        // }

        // console.log(`TEST: FOUND ROLE ASSIGNMENTS:`);
        // console.log(roleAssignments);

        // const managedIdentities = roleAssignments.filter(roleAssignment => {
        //     return roleAssignment.principalType === 'ServicePrincipal';
        // });

        // console.log(`TEST: FOUND MANAGED IDENTITIES:`);
        // console.log(managedIdentities);

        // const mySystemAssignedManagedIdentities = managedIdentities.filter(roleAssignment => roleAssignment.principalId === "9ce64fb7-5f1f-43bd-a284-2c573b422d91" || roleAssignment.principalId === "7e111aeb-cb73-49f0-a057-767c5275d752" /* this.parent.site.identity.principalId */);

        // console.log(`TEST: FOUND MY SYSTEM ASSIGNED MANAGED IDENTITIES:`);
        // console.log(mySystemAssignedManagedIdentities);
        // const retries = 3;
        // const client = await this.parent.site.createClient(context);

        // const funcs = await retry<FunctionEnvelope[]>(
        //     async (attempt: number) => {
        //         const credential = ext.
        //         const authorizationClient: AuthorizationManagementClient = await this.parent.site.createAuthorizationClient(context);
        //         const response = await client.listFunctions();
        //         const failedToList = localize('failedToList', 'Failed to list functions.');

        //         // https://github.com/Azure/azure-functions-host/issues/3502
        //         if (!Array.isArray(response)) {
        //             throw new Error(failedToList);
        //         }

        //         // Retry listing functions if all we see is a "WarmUp" function, an internal function that goes away once the app is ...warmed up
        //         if (!(response.length === 1 && isWarmupFunction(response[0]))) {
        //             context.telemetry.measurements.listFunctionsAttempt = attempt;
        //         } else {
        //             throw new Error(failedToList);
        //         }

        //         return response;
        //     },
        //     { retries, minTimeout: 10 * 1000 }
        // );

        return await this.createTreeItemsWithErrorHandling(
            roleAccessItems,
            'azFuncInvalidRoleAccess',
            async ([scope, roles]) => await RoleAccessScopeTreeItem.create(context, this, scope, roles),
            ([scope, roles]) => roles[0].resourceName || scope
        );
    }
}
