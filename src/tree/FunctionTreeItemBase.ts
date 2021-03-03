/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementModels } from '@azure/arm-appservice';
import * as url from 'url';
import { AzExtTreeItem, IActionContext, TreeItemIconPath } from 'vscode-azureextensionui';
import { HttpAuthLevel, ParsedFunctionJson } from '../funcConfig/function';
import { IParsedHostJson } from '../funcConfig/host';
import { FuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { treeUtils } from '../utils/treeUtils';
import { FunctionsTreeItemBase } from './FunctionsTreeItemBase';
import { ApplicationSettings } from './IProjectTreeItem';
import { getProjectContextValue, ProjectResource } from './projectContextValues';

export abstract class FunctionTreeItemBase extends AzExtTreeItem {
    public readonly parent: FunctionsTreeItemBase;
    public readonly name: string;
    public readonly commandId: string = 'azureFunctions.viewProperties';
    public triggerUrl: string | undefined;

    protected readonly _config: ParsedFunctionJson;
    private _disabled: boolean;
    private _func: WebSiteManagementModels.FunctionEnvelope | undefined;

    protected constructor(parent: FunctionsTreeItemBase, config: ParsedFunctionJson, name: string, func: WebSiteManagementModels.FunctionEnvelope | undefined) {
        super(parent);
        this._config = config;
        this.name = name;
        this._func = func;
    }

    public get id(): string {
        return this.name;
    }

    public get label(): string {
        return this.name;
    }

    public get isHttpTrigger(): boolean {
        // invokeUrlTemplate take precedence. Config can't always be retrieved
        return !!this._func?.invokeUrlTemplate || this._config.isHttpTrigger;
    }

    public get isTimerTrigger(): boolean {
        return this._config.isTimerTrigger;
    }

    public get isAnonymous(): boolean {
        return this._config.authLevel === HttpAuthLevel.anonymous;
    }

    public get rawConfig(): {} {
        return this._config.data;
    }

    public get triggerBindingType(): string | undefined {
        return this._config.triggerBinding?.type;
    }

    public get contextValue(): string {
        let triggerType: string;
        if (this.isHttpTrigger) {
            triggerType = 'Http';
        } else if (this.isTimerTrigger) {
            triggerType = 'Timer';
        } else {
            triggerType = 'Unknown';
        }

        const state: string = this._disabled ? 'Disabled' : 'Enabled';

        return getProjectContextValue(this.parent.parent.source, this.parent.access, ProjectResource.Function, triggerType, state);
    }

    public get description(): string | undefined {
        const descriptions: string[] = [];
        if (this.isHttpTrigger) {
            descriptions.push(localize('http', 'HTTP'));
        } else if (this.isTimerTrigger) {
            descriptions.push(localize('timer', 'Timer'));
        }

        if (this._disabled) {
            descriptions.push(localize('disabledFunction', 'Disabled'));
        }

        return descriptions.join(' - ');
    }

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getIconPath('azFuncFunction');
    }

    public get disabledStateKey(): string {
        return `AzureWebJobs.${this.name}.Disabled`;
    }

    public abstract getKey(): Promise<string | undefined>;

    public async refreshImpl(_context: IActionContext, isInitializing?: boolean): Promise<void> {
        if (!isInitializing) { // no need to refresh "_func" if we're initializing the class since it's set in the constructor
            this._func = await this.refreshFuncEnvelope();
        }

        if (this.isHttpTrigger) {
            await this.refreshTriggerUrl();
        }

        await this.refreshDisabledState();
    }

    public abstract refreshFuncEnvelope(): Promise<WebSiteManagementModels.FunctionEnvelope | undefined>;

    private async refreshTriggerUrl(): Promise<void> {
        const hostUrl = new url.URL(this.parent.parent.hostUrl);
        let triggerUrl: url.URL;
        if (this._func?.invokeUrlTemplate) {
            triggerUrl = new url.URL(this._func?.invokeUrlTemplate);
            triggerUrl.protocol = hostUrl.protocol; // invokeUrlTemplate seems to use the wrong protocol sometimes. Make sure it matches the hostUrl
        } else {
            triggerUrl = hostUrl;
            const route: string = (this._config.triggerBinding && this._config.triggerBinding.route) || this.name;
            const hostJson: IParsedHostJson = await this.parent.parent.getHostJson();
            triggerUrl.pathname = `${hostJson.routePrefix}/${route}`;
        }

        const key: string | undefined = await this.getKey();
        if (key) {
            triggerUrl.searchParams.set('code', key);
        }

        this.triggerUrl = triggerUrl.toString();
    }

    /**
     * https://docs.microsoft.com/azure/azure-functions/disable-function
     */
    private async refreshDisabledState(): Promise<void> {
        if (this._func) {
            this._disabled = !!this._func.isDisabled;
        } else {
            const version: FuncVersion = await this.parent.parent.getVersion();
            if (version === FuncVersion.v1) {
                this._disabled = this._config.disabled;
            } else {
                const appSettings: ApplicationSettings = await this.parent.parent.getApplicationSettings();

                /**
                 * The docs only officially mentioned 'true' and 'false', but here is what I found:
                 * The following resulted in a disabled function:
                 * true, tRue, 1
                 * The following resulted in an enabled function:
                 * false, fAlse, 0, fdsaf, 2, undefined
                 */
                this._disabled = /^(1|true)$/i.test(appSettings[this.disabledStateKey] || '');
            }
        }
    }
}
