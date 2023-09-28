/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FunctionEnvelope } from '@azure/arm-appservice';
import { AzExtTreeItem, IActionContext, TreeItemIconPath } from '@microsoft/vscode-azext-utils';
import * as url from 'url';
import { FuncVersion } from '../FuncVersion';
import { HttpAuthLevel, ParsedFunctionJson } from '../funcConfig/function';
import { IParsedHostJson } from '../funcConfig/host';
import { localize } from '../localize';
import { treeUtils } from '../utils/treeUtils';
import { FunctionsTreeItemBase } from './FunctionsTreeItemBase';
import { ApplicationSettings, FuncHostRequest, IProjectTreeItem } from './IProjectTreeItem';
import { ProjectResource, getProjectContextValue } from './projectContextValues';

export interface IFunction {
    project: IProjectTreeItem;

    name: string;
    isHttpTrigger: boolean;
    isTimerTrigger: boolean;
    isAnonymous: boolean;
    triggerBindingType: string | undefined;

    getTriggerRequest(context: IActionContext): Promise<FuncHostRequest | undefined>;
}

export abstract class FunctionBase implements IFunction {
    constructor(public readonly project: IProjectTreeItem, public readonly name: string, public readonly config: ParsedFunctionJson, public readonly func?: FunctionEnvelope) { }

    public abstract getKey(context: IActionContext): Promise<string | undefined>;

    public async getTriggerRequest(context: IActionContext): Promise<FuncHostRequest | undefined> {
        if (!this.isHttpTrigger) {
            return undefined;
        } else {
            const funcHostReq = await this.project.getHostRequest(context);
            const hostUrl = new url.URL(funcHostReq.url);
            let triggerUrl: url.URL;
            if (this.func?.invokeUrlTemplate) {
                triggerUrl = new url.URL(this.func?.invokeUrlTemplate);
                triggerUrl.protocol = hostUrl.protocol; // invokeUrlTemplate seems to use the wrong protocol sometimes. Make sure it matches the hostUrl
            } else {
                triggerUrl = hostUrl;
                const route: string = (this.config.triggerBinding && this.config.triggerBinding.route) || this.name;
                const hostJson: IParsedHostJson = await this.project.getHostJson(context);
                triggerUrl.pathname = `${hostJson.routePrefix}/${route}`;
            }

            const key: string | undefined = await this.getKey(context);
            if (key) {
                triggerUrl.searchParams.set('code', key);
            }

            return { url: triggerUrl.toString(), rejectUnauthorized: funcHostReq.rejectUnauthorized };
        }
    }

    public get isHttpTrigger(): boolean {
        // invokeUrlTemplate take precedence. Config can't always be retrieved
        return !!this.func?.invokeUrlTemplate || this.config.isHttpTrigger;
    }

    public get isTimerTrigger(): boolean {
        return this.config.isTimerTrigger;
    }

    public get isAnonymous(): boolean {
        return this.config.authLevel === HttpAuthLevel.anonymous;
    }

    public get triggerBindingType(): string | undefined {
        return this.config.triggerBinding?.type;
    }
}

export abstract class FunctionTreeItemBase extends AzExtTreeItem {
    public readonly parent: FunctionsTreeItemBase;
    public readonly name: string;
    public readonly project: IProjectTreeItem;

    protected readonly _config: ParsedFunctionJson;
    private _disabled: boolean;
    private _func: FunctionEnvelope | undefined;

    public readonly function: FunctionBase;

    protected constructor(parent: FunctionsTreeItemBase, config: ParsedFunctionJson, name: string, func: FunctionEnvelope | undefined, enableProperties: boolean = true) {
        super(parent);
        this._config = config;
        this.name = name;
        this._func = func;
        this.project = this.parent.parent;

        if (enableProperties) {
            this.commandId = 'azureFunctions.viewProperties';
        }
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

    public abstract getKey(context: IActionContext): Promise<string | undefined>;

    public async initAsync(context: IActionContext): Promise<void> {
        await this.refreshDisabledState(context);
    }

    public async getTriggerRequest(context: IActionContext): Promise<FuncHostRequest | undefined> {
        if (!this.isHttpTrigger) {
            return undefined;
        } else {
            const funcHostReq = await this.parent.parent.getHostRequest(context);
            const hostUrl = new url.URL(funcHostReq.url);
            let triggerUrl: url.URL;
            if (this._func?.invokeUrlTemplate) {
                triggerUrl = new url.URL(this._func?.invokeUrlTemplate);
                triggerUrl.protocol = hostUrl.protocol; // invokeUrlTemplate seems to use the wrong protocol sometimes. Make sure it matches the hostUrl
            } else {
                triggerUrl = hostUrl;
                const route: string = (this._config.triggerBinding && this._config.triggerBinding.route) || this.name;
                const hostJson: IParsedHostJson = await this.parent.parent.getHostJson(context);
                triggerUrl.pathname = `${hostJson.routePrefix}/${route}`;
            }

            const key: string | undefined = await this.getKey(context);
            if (key) {
                triggerUrl.searchParams.set('code', key);
            }

            return { url: triggerUrl.toString(), rejectUnauthorized: funcHostReq.rejectUnauthorized };
        }
    }

    /**
     * https://docs.microsoft.com/azure/azure-functions/disable-function
     */
    private async refreshDisabledState(context: IActionContext): Promise<void> {
        if (this._func) {
            this._disabled = !!this._func.isDisabled;
        } else {
            const version: FuncVersion = await this.parent.parent.getVersion(context);
            if (version === FuncVersion.v1) {
                this._disabled = this._config.disabled;
            } else {
                const appSettings: ApplicationSettings = await this.parent.parent.getApplicationSettings(context);

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
