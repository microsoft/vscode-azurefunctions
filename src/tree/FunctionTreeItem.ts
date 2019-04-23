/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from 'azure-arm-website';
import * as url from 'url';
import { ProgressLocation, window } from 'vscode';
import { functionsAdminRequest, ISiteTreeRoot } from 'vscode-azureappservice';
import { AzureTreeItem, DialogResponses } from 'vscode-azureextensionui';
import { ProjectRuntime } from '../constants';
import { ext } from '../extensionVariables';
import { HttpAuthLevel, ParsedFunctionJson } from '../funcConfig/function';
import { localize } from '../localize';
import { nodeUtils } from '../utils/nodeUtils';
import { nonNullProp } from '../utils/nonNull';
import { FunctionsTreeItem } from './FunctionsTreeItem';

export class FunctionTreeItem extends AzureTreeItem<ISiteTreeRoot> {
    public static contextValueBase: string = 'azFuncFunction';
    public readonly parent: FunctionsTreeItem;
    public readonly config: ParsedFunctionJson;
    public readonly name: string;

    private _triggerUrl: string | undefined;
    private _disabled: boolean;

    private constructor(parent: FunctionsTreeItem, func: WebSiteManagementModels.FunctionEnvelope) {
        super(parent);
        this.name = getFunctionNameFromId(nonNullProp(func, 'id'));

        this.config = new ParsedFunctionJson(func.config);
    }

    public static async createFunctionTreeItem(parent: FunctionsTreeItem, func: WebSiteManagementModels.FunctionEnvelope): Promise<FunctionTreeItem> {
        const ti: FunctionTreeItem = new FunctionTreeItem(parent, func);
        // initialize
        await ti.refreshImpl();
        return ti;
    }

    public get id(): string {
        return this.name;
    }

    public get label(): string {
        return this.name;
    }

    public get contextValue(): string {
        let contextValue: string = FunctionTreeItem.contextValueBase;
        if (this.config.isHttpTrigger) {
            contextValue += 'Http';
        } else if (this.config.isTimerTrigger) {
            contextValue += 'Timer';
        }

        if (this.parent.readOnly) {
            contextValue += 'ReadOnly';
        }

        return contextValue;
    }

    public get description(): string | undefined {
        const descriptions: string[] = [];
        if (this.config.isHttpTrigger) {
            descriptions.push(localize('http', 'HTTP'));
        } else if (this.config.isTimerTrigger) {
            descriptions.push(localize('timer', 'Timer'));
        }

        if (this._disabled) {
            descriptions.push(localize('disabledFunction', 'Disabled'));
        }

        return descriptions.join(' - ');
    }

    public get iconPath(): string {
        return nodeUtils.getIconPath(FunctionTreeItem.contextValueBase);
    }

    public get triggerUrl(): string | undefined {
        return this._triggerUrl;
    }

    public get logStreamLabel(): string {
        return `${this.root.client.fullName}/${this.name}`;
    }

    public get logStreamPath(): string {
        return `application/functions/function/${encodeURIComponent(this.name)}`;
    }

    public async refreshImpl(): Promise<void> {
        if (this.config.isHttpTrigger) {
            await this.refreshTriggerUrl();
        }

        await this.refreshDisabledState();
    }

    public async deleteTreeItemImpl(): Promise<void> {
        const message: string = localize('ConfirmDeleteFunction', 'Are you sure you want to delete function "{0}"?', this.name);
        const deleting: string = localize('DeletingFunction', 'Deleting function "{0}"...', this.name);
        const deleteSucceeded: string = localize('DeleteFunctionSucceeded', 'Successfully deleted function "{0}".', this.name);
        await ext.ui.showWarningMessage(message, { modal: true }, DialogResponses.deleteResponse, DialogResponses.cancel);
        await window.withProgress({ location: ProgressLocation.Notification, title: deleting }, async (): Promise<void> => {
            ext.outputChannel.appendLine(deleting);
            await this.root.client.deleteFunction(this.name);
            window.showInformationMessage(deleteSucceeded);
            ext.outputChannel.appendLine(deleteSucceeded);
        });
    }

    public isAncestorOfImpl(_contextValue: string | RegExp): boolean {
        return false;
    }

    public async getKey(): Promise<string | undefined> {
        let urlPath: string;
        switch (this.config.authLevel) {
            case HttpAuthLevel.admin:
                urlPath = '/host/systemkeys/_master';
                break;
            case HttpAuthLevel.function:
                urlPath = `functions/${this.name}/keys/default`;
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

        throw new Error(localize('keyFail', 'Failed to get key for trigger "{0}".', this.name));
    }

    private async refreshTriggerUrl(): Promise<void> {
        const triggerUrl: url.URL = new url.URL(this.root.client.defaultHostUrl);

        // tslint:disable-next-line: strict-boolean-expressions
        const route: string = (this.config.triggerBinding && this.config.triggerBinding.route) || this.name;
        triggerUrl.pathname = `${this.parent.parent.hostJson.routePrefix}/${route}`;

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
        if (this.parent.parent.runtime === ProjectRuntime.v1) {
            this._disabled = this.config.disabled;
        } else {
            const appSettings: WebSiteManagementModels.StringDictionary = await this.root.client.listApplicationSettings();
            // tslint:disable-next-line:strict-boolean-expressions
            appSettings.properties = appSettings.properties || {};
            const key: string = `AzureWebJobs.${this.name}.Disabled`;
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
