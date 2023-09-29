/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FunctionEnvelope } from '@azure/arm-appservice';
import { AzExtParentTreeItem, AzExtTreeItem, IActionContext, TreeItemIconPath } from '@microsoft/vscode-azext-utils';
import * as url from 'url';
import { FuncVersion } from '../FuncVersion';
import { HttpAuthLevel, ParsedFunctionJson } from '../funcConfig/function';
import { IParsedHostJson } from '../funcConfig/host';
import { localize } from '../localize';
import { treeUtils } from '../utils/treeUtils';
import { IFunction } from '../workspace/LocalFunction';
import { FunctionsTreeItemBase } from './FunctionsTreeItemBase';
import { ApplicationSettings, FuncHostRequest, IProjectTreeItem } from './IProjectTreeItem';
import { ProjectResource, getProjectContextValue } from './projectContextValues';

export abstract class FunctionBase implements IFunction {
    constructor(
        public readonly project: IProjectTreeItem,
        public readonly name: string,
        public readonly config: ParsedFunctionJson,
        public readonly data?: FunctionEnvelope
    ) { }

    public abstract getKey(context: IActionContext): Promise<string | undefined>;

    public async getTriggerRequest(context: IActionContext): Promise<FuncHostRequest | undefined> {
        if (!this.isHttpTrigger) {
            return undefined;
        } else {
            const funcHostReq = await this.project.getHostRequest(context);
            const hostUrl = new url.URL(funcHostReq.url);
            let triggerUrl: url.URL;
            if (this.data?.invokeUrlTemplate) {
                triggerUrl = new url.URL(this.data?.invokeUrlTemplate);
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
        return !!this.data?.invokeUrlTemplate || this.config.isHttpTrigger;
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
    public readonly project: IProjectTreeItem;
    public readonly function: FunctionBase;
    private _disabled: boolean;

    protected constructor(parent: AzExtParentTreeItem, private readonly func: IFunction, enableProperties: boolean = true) {
        super(parent);
        this.project = this.parent.parent;
        this.function = func;

        if (enableProperties) {
            this.commandId = 'azureFunctions.viewProperties';
        }
    }

    public get id(): string {
        return this.function.name;
    }

    public get label(): string {
        return this.function.name;
    }

    public get isHttpTrigger(): boolean {
        return this.func.isHttpTrigger;
    }

    public get isTimerTrigger(): boolean {
        return this.function.isTimerTrigger;
    }

    public get isAnonymous(): boolean {
        return this.function.isAnonymous;
    }

    public get rawConfig(): {} {
        return this.function.config;
    }

    public get triggerBindingType(): string | undefined {
        return this.function.triggerBindingType;
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
        return `AzureWebJobs.${this.function.name}.Disabled`;
    }

    public async initAsync(context: IActionContext): Promise<void> {
        await this.refreshDisabledState(context);
    }

    public async getTriggerRequest(context: IActionContext): Promise<FuncHostRequest | undefined> {
        return this.function.getTriggerRequest(context);
    }

    /**
     * https://docs.microsoft.com/azure/azure-functions/disable-function
     */
    private async refreshDisabledState(context: IActionContext): Promise<void> {
        if (this.func.data) {
            this._disabled = !!this.func.data.isDisabled;
        } else {
            const version: FuncVersion = await this.project.getVersion(context);
            if (version === FuncVersion.v1) {
                this._disabled = this.function.config.disabled;
            } else {
                const appSettings: ApplicationSettings = await this.project.getApplicationSettings(context);

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
