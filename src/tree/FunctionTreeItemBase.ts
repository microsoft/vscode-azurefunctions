/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as url from 'url';
import { AzExtTreeItem, TreeItemIconPath } from 'vscode-azureextensionui';
import { ParsedFunctionJson } from '../funcConfig/function';
import { IParsedHostJson } from '../funcConfig/host';
import { FuncVersion } from '../FuncVersion';
import { localize } from '../localize';
import { treeUtils } from '../utils/treeUtils';
import { FunctionsTreeItemBase } from './FunctionsTreeItemBase';
import { ApplicationSettings } from './IProjectTreeItem';
import { getProjectContextValue, ProjectResource } from './projectContextValues';

export abstract class FunctionTreeItemBase extends AzExtTreeItem {
    public readonly parent: FunctionsTreeItemBase;
    public readonly config: ParsedFunctionJson;
    public readonly name: string;
    public readonly commandId: string = 'azureFunctions.viewProperties';
    public triggerUrl: string | undefined;

    private _disabled: boolean;

    protected constructor(parent: FunctionsTreeItemBase, config: ParsedFunctionJson, name: string) {
        super(parent);
        this.config = config;
        this.name = name;
    }

    public get id(): string {
        return this.name;
    }

    public get label(): string {
        return this.name;
    }

    public get contextValue(): string {
        let triggerType: string;
        if (this.config.isHttpTrigger) {
            triggerType = 'Http';
        } else if (this.config.isTimerTrigger) {
            triggerType = 'Timer';
        } else {
            triggerType = 'Unknown';
        }

        const state: string = this._disabled ? 'Disabled' : 'Enabled';

        return getProjectContextValue(this.parent.parent.source, this.parent.access, ProjectResource.Function, triggerType, state);
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

    public get iconPath(): TreeItemIconPath {
        return treeUtils.getIconPath('azFuncFunction');
    }

    public get disabledStateKey(): string {
        return `AzureWebJobs.${this.name}.Disabled`;
    }

    public abstract getKey(): Promise<string | undefined>;

    public async refreshImpl(): Promise<void> {
        if (this.config.isHttpTrigger) {
            await this.refreshTriggerUrl();
        }

        await this.refreshDisabledState();
    }

    private async refreshTriggerUrl(): Promise<void> {
        const triggerUrl: url.URL = new url.URL(this.parent.parent.hostUrl);

        // tslint:disable-next-line: strict-boolean-expressions
        const route: string = (this.config.triggerBinding && this.config.triggerBinding.route) || this.name;
        const hostJson: IParsedHostJson = await this.parent.parent.getHostJson();
        triggerUrl.pathname = `${hostJson.routePrefix}/${route}`;

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
        const version: FuncVersion = await this.parent.parent.getVersion();
        if (version === FuncVersion.v1) {
            this._disabled = this.config.disabled;
        } else {
            const appSettings: ApplicationSettings = await this.parent.parent.getApplicationSettings();

            /**
             * The docs only officially mentioned 'true' and 'false', but here is what I found:
             * The following resulted in a disabled function:
             * true, tRue, 1
             * The following resulted in an enabled function:
             * false, fAlse, 0, fdsaf, 2, undefined
             */
            // tslint:disable-next-line:strict-boolean-expressions
            this._disabled = /^(1|true)$/i.test(appSettings[this.disabledStateKey] || '');
        }
    }
}
