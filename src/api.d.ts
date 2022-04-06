/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem, AzExtTreeDataProvider, AzExtTreeItem, IActionContext, ICreateChildImplContext, ISubscriptionContext, TreeItemIconPath } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';

export interface AzureResourceGroupsExtensionApi {
    readonly tree: AzExtTreeDataProvider;
    readonly treeView: vscode.TreeView<AzExtTreeItem>;

    readonly apiVersion: string;
    revealTreeItem(resourceId: string): Promise<void>;
    registerApplicationResourceResolver(id: string, resolver: AppResourceResolver): vscode.Disposable;
    registerLocalResourceProvider(id: string, provider: LocalResourceProvider): vscode.Disposable;
}

/**
 * An abstract interface for GenericResource
 */
export interface AppResource {
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly kind?: string;
    readonly location?: string;
    /** Resource tags */
    readonly tags?: {
        [propertyName: string]: string;
    };
    /* add more properties from GenericResource if needed */
}

/**
 * Defines how a group tree item is created and appears in the tree view
 */
export interface GroupNodeConfiguration {
    readonly label: string;
    readonly id: string;
    // label for GroupBy Configurations
    readonly keyLabel?: string;
    readonly description?: string;
    readonly icon?: vscode.ThemeIcon;
    readonly iconPath?: string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri } | vscode.ThemeIcon;
    readonly contextValue?: string;
}

/**
 * Defines how a leaf tree item is grouped
 */
export interface GroupingConfig {
    readonly resourceGroup: GroupNodeConfiguration;
    readonly resourceType: GroupNodeConfiguration;
    [label: string]: GroupNodeConfiguration; // Don't need to support right off the bat but we can put it in the interface
}

/**
 * A resource that can be grouped
 */
export interface GroupableResource {
    readonly groupConfig: GroupingConfig;
}

/**
 * AzExtTreeItem properties that cannot be overridden by an app resource resolver.
 */
export interface SealedAzExtTreeItem {
    refresh(): Promise<void>;
    /**
     * This id represents the effective/serializable full id of the item in the tree. It always starts with the parent's fullId and ends with either the AzExtTreeItem.id property (if implemented) or AzExtTreeItem.label property
     * This is used for AzureTreeDataProvider.findTreeItem and openInPortal
     */
    readonly fullId: string;
    readonly parent?: AzExtParentTreeItem;
    readonly treeDataProvider: AzExtTreeDataProvider;

    /**
     * The subscription information for this branch of the tree
     * Throws an error if this branch of the tree is not actually for Azure resources
     */
    readonly subscription: ISubscriptionContext;

    /**
     * Values to mask in error messages whenever an action uses this tree item
     * NOTE: Some values are automatically masked without the need to add anything here, like the label and parts of the id if it's an Azure id
     */
    readonly valuesToMask: string[];

    /**
     * Set to true if the label of this tree item does not need to be masked
     */
    suppressMaskLabel?: boolean;
}

// AzExtTreeItem stuff we need them to implement

/**
 * AzExtTreeItem properties that can be provided by an app resource resolver.
 */
export interface AbstractAzExtTreeItem {

    id: string;
    label: string;

    /**
     * Additional information about a tree item that is appended to the label with the format `label (description)`
     */
    description: string | undefined;

    iconPath: TreeItemIconPath | undefined;
    commandId?: string;
    tooltip?: string;

    /**
     * The arguments to pass in when executing `commandId`. If not specified, this tree item will be used.
     */
    commandArgs?: unknown[];
    contextValue: string;

    /**
      * Implement this to display child resources. Should not be called directly
      * @param clearCache If true, you should start the "Load more..." process over
      * @param context The action context
      */
    loadMoreChildrenImpl?(clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]>;

    /**
    * Implement this as a part of the "Load more..." action. Should not be called directly
    * @returns 'true' if there are more children and a "Load more..." node should be displayed
    */
    hasMoreChildrenImpl?(): boolean;

    /**
     * Implement this if you want the 'create' option to show up in the tree picker. Should not be called directly
     * @param context The action context and any additional user-defined options that are passed to the `AzExtParentTreeItem.createChild` or `AzExtTreeDataProvider.showTreeItemPicker`
     */
    createChildImpl?(context: ICreateChildImplContext): Promise<AzExtTreeItem>;

    /**
     * Override this if you want non-default (i.e. non-alphabetical) sorting of children. Should not be called directly
     * @param item1 The first item to compare
     * @param item2 The second item to compare
     * @returns A negative number if the item1 occurs before item2; positive if item1 occurs after item2; 0 if they are equivalent
     */
    compareChildrenImpl?(item1: AzExtTreeItem, item2: AzExtTreeItem): number;

    /**
    * If this treeItem should not show up in the tree picker or you want custom logic to show quick picks, implement this to provide a child that corresponds to the expectedContextValue. Should not be called directly
    * Otherwise, all children will be shown in the tree picker
    */
    pickTreeItemImpl?(expectedContextValues: (string | RegExp)[], context: IActionContext): AzExtTreeItem | undefined | Promise<AzExtTreeItem | undefined>;

    /**
     * Implement this to support the 'delete' action in the tree. Should not be called directly
     */
    deleteTreeItemImpl?(context: IActionContext): Promise<void>;

    /**
     * Implement this to execute any async code when this node is refreshed. Should not be called directly
     */
    refreshImpl?(context: IActionContext): Promise<void>;

    /**
     * Optional function to filter items displayed in the tree picker. Should not be called directly
     * If not implemented, it's assumed that 'isAncestorOf' evaluates to true
     */
    isAncestorOfImpl?(contextValue: string | RegExp): boolean;
}

interface ContextValuesToAdd {
    /**
     * Resolvers are not allowed to set the context value. Instead, they must provide `contextValuesToAdd`
     */
    contextValue?: never;

    /**
     * These will be added to a Set<string> of context values. The array is *not* pre-initialized as an empty array.
     */
    contextValuesToAdd?: string[];
}

export type ResolvedAppResourceBase = Partial<{ [P in keyof SealedAzExtTreeItem]: never }> & Partial<AbstractAzExtTreeItem> & ContextValuesToAdd;

export type ResolvedAppResourceTreeItem<T extends ResolvedAppResourceBase> = AppResource & SealedAzExtTreeItem & Omit<T, keyof ResolvedAppResourceBase>;

export type LocalResource = AzExtTreeItem;

export interface AppResourceResolver {
    resolveResource(subContext: ISubscriptionContext, resource: AppResource): vscode.ProviderResult<ResolvedAppResourceBase>;
    matchesResource(resource: AppResource): boolean;
}

/**
 * Resource extensions call this to register app resource resolvers.
 *
 * @param id
 * @param resolver
 */
export declare function registerApplicationResourceResolver(id: string, resolver: AppResourceResolver): vscode.Disposable;

// Not part of public interface to start with--only Resource Groups extension will call it (for now)
// currently implemented as AzureResourceProvider
export interface AppResourceProvider {
    provideResources(
        subContext: ISubscriptionContext
    ): vscode.ProviderResult<AppResource[]>;
}

export interface LocalResourceProvider {
    provideResources(parent: AzExtParentTreeItem): vscode.ProviderResult<LocalResource[] | undefined>;
}

// Resource Groups can have a default resolve() method that it supplies, that will activate the appropriate extension and give it a chance to replace the resolve() method
// ALSO, it will eliminate that default resolver from future calls for that resource type

// called from host extension (Resource Groups)
// Will need a manifest of extensions mapping type => extension ID
export declare function registerApplicationResourceProvider(id: string, provider: AppResourceProvider): vscode.Disposable;

// resource extensions need to activate onView:localResourceView and call this
export declare function registerLocalResourceProvider(id: string, provider: LocalResourceProvider): vscode.Disposable;
