/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import { URL } from 'url';
import { ProgressLocation, window } from 'vscode';
import { functionsAdminRequest, ISiteTreeRoot } from 'vscode-azureappservice';
import { AzureParentTreeItem, AzureTreeItem, DialogResponses } from 'vscode-azureextensionui';
import { ProjectRuntime } from '../constants';
import { ArgumentError } from '../errors';
import { ext } from '../extensionVariables';
import { FunctionConfig, HttpAuthLevel } from '../FunctionConfig';
import { localize } from '../localize';
import { convertStringToRuntime } from '../ProjectSettings';
import { nodeUtils } from '../utils/nodeUtils';

export class FunctionTreeItem extends AzureTreeItem<ISiteTreeRoot> {
    public static contextValue: string = 'azFuncFunction';
    public readonly contextValue: string = FunctionTreeItem.contextValue;
    public readonly config: FunctionConfig;

    private readonly _name: string;
    private _triggerUrl: string;
    private _disabled: boolean;

    private constructor(parent: AzureParentTreeItem, func: WebSiteManagementModels.FunctionEnvelope) {
        super(parent);
        if (!func.id) {
            throw new ArgumentError(func);
        }

        this._name = getFunctionNameFromId(func.id);

        this.config = new FunctionConfig(func.config);
    }

    public static async createFunctionTreeItem(parent: AzureParentTreeItem, func: WebSiteManagementModels.FunctionEnvelope): Promise<FunctionTreeItem> {
        const ti: FunctionTreeItem = new FunctionTreeItem(parent, func);
        // initialize
        await ti.refreshImpl();
        return ti;
    }

    public get id(): string {
        return this._name;
    }

    public get label(): string {
        return this._name;
    }

    public get description(): string | undefined {
        return this._disabled ? localize('disabledFunction', 'Disabled') : undefined;
    }

    public get iconPath(): string {
        return nodeUtils.getIconPath(FunctionTreeItem.contextValue);
    }

    public get triggerUrl(): string {
        return this._triggerUrl;
    }

    public get logStreamLabel(): string {
        return `${this.root.client.fullName}/${this._name}`;
    }

    public get logStreamPath(): string {
        return `application/functions/function/${encodeURIComponent(this._name)}`;
    }

    public async refreshImpl(): Promise<void> {
        await this.refreshTriggerUrl();
        await this.refreshDisabledState();
    }

    public async deleteTreeItemImpl(): Promise<void> {
        const message: string = localize('ConfirmDeleteFunction', 'Are you sure you want to delete function "{0}"?', this._name);
        const deleting: string = localize('DeletingFunction', 'Deleting function "{0}"...', this._name);
        const deleteSucceeded: string = localize('DeleteFunctionSucceeded', 'Successfully deleted function "{0}".', this._name);
        await ext.ui.showWarningMessage(message, { modal: true }, DialogResponses.deleteResponse, DialogResponses.cancel);
        await window.withProgress({ location: ProgressLocation.Notification, title: deleting }, async (): Promise<void> => {
            ext.outputChannel.appendLine(deleting);
            await this.root.client.deleteFunction(this._name);
            window.showInformationMessage(deleteSucceeded);
            ext.outputChannel.appendLine(deleteSucceeded);
        });
    }

    public async getKey(): Promise<string | undefined> {
        let urlPath: string;
        switch (this.config.authLevel) {
            case HttpAuthLevel.admin:
                urlPath = '/host/systemkeys/_master';
                break;
            case HttpAuthLevel.function:
                urlPath = `functions/${this._name}/keys/default`;
                break;
            case HttpAuthLevel.anonymous:
            default:
                return undefined;
        }

        const data: string = await functionsAdminRequest(this.root.client, urlPath);
        try {
            // tslint:disable-next-line:no-unsafe-any
            const result: string = JSON.parse(data).value;
            if (result) {
                return result;
            }
        } catch {
            // ignore json parse error and throw better error below
        }

        throw new Error(localize('keyFail', 'Failed to get key for trigger "{0}".', this._name));
    }

    private async refreshTriggerUrl(): Promise<void> {
        const triggerUrl: URL = new URL(`${this.root.client.defaultHostUrl}/api/${this._name}`);
        const key: string | undefined = await this.getKey();
        if (key) {
            triggerUrl.searchParams.set('code', key);
        }

        this._triggerUrl = triggerUrl.toString();
    }

    /**
     * https://docs.microsoft.com/azure/azure-functions/disable-function
     */
    private async refreshDisabledState(): Promise<void> {
        const appSettings: WebSiteManagementModels.StringDictionary = await this.root.client.listApplicationSettings();
        // tslint:disable-next-line:strict-boolean-expressions
        appSettings.properties = appSettings.properties || {};
        const projectRuntime: ProjectRuntime | undefined = convertStringToRuntime(appSettings.properties.FUNCTIONS_EXTENSION_VERSION);
        if (projectRuntime === ProjectRuntime.v1) {
            this._disabled = this.config.disabled;
        } else {
            const key: string = `AzureWebJobs.${this._name}.Disabled`;
            /**
             * The docs only officially mentioned 'true' and 'false', but here is what I found:
             * The following resulted in a disabled function:
             * true, tRue, 1
             * The following resulted in an enabled function:
             * false, fAlse, 0, fdsaf, 2, undefined
             */
            // tslint:disable-next-line:strict-boolean-expressions
            this._disabled = /^(1|true)$/i.test(appSettings.properties[key] || '');
        }
    }
}

export function getFunctionNameFromId(id: string): string {
    const matches: RegExpMatchArray | null = id.match(/\/subscriptions\/(?:[^\/]+)\/resourceGroups\/(?:[^\/]+)\/providers\/Microsoft.Web\/sites\/(?:[^\/]+)\/functions\/([^\/]+)/);

    if (matches === null || matches.length < 2) {
        throw new Error(localize('invalidFuncId', 'Invalid Functions Id'));
    }

    return matches[1];
}
