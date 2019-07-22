/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as url from 'url';
import { AzExtParentTreeItem } from 'vscode-azureextensionui';
import { ProjectRuntime } from '../constants';
import { ParsedFunctionJson } from '../funcConfig/function';
import { IParsedHostJson } from '../funcConfig/host';
import { localize } from '../localize';
import { treeUtils } from '../utils/treeUtils';
import { FunctionsTreeItemBase } from './FunctionsTreeItemBase';
import { ApplicationSettings } from './IProjectTreeItem';
import { getProjectContextValue, matchesAnyPart, ProjectResource } from './projectContextValues';

export abstract class FunctionTreeItemBase extends AzExtParentTreeItem {
    public readonly parent: FunctionsTreeItemBase;
    public readonly config: ParsedFunctionJson;
    public readonly name: string;
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

        return getProjectContextValue(this.parent.parent.source, this.parent.access, ProjectResource.Function, triggerType);
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
        return treeUtils.getIconPath('azFuncFunction');
    }

    public abstract getKey(): Promise<string | undefined>;

    public async refreshImpl(): Promise<void> {
        if (this.config.isHttpTrigger) {
            await this.refreshTriggerUrl();
        }

        await this.refreshDisabledState();
    }

    public isAncestorOfImpl(contextValue: string | RegExp): boolean {
        return matchesAnyPart(contextValue, ProjectResource.Bindings, ProjectResource.Binding);
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
        const runtime: ProjectRuntime = await this.parent.parent.getRuntime();
        if (runtime === ProjectRuntime.v1) {
            this._disabled = this.config.disabled;
        } else {
            const appSettings: ApplicationSettings = await this.parent.parent.getApplicationSettings();
            // tslint:disable-next-line:strict-boolean-expressions
            const key: string = `AzureWebJobs.${this.name}.Disabled`;
            /**
             * The docs only officially mentioned 'true' and 'false', but here is what I found:
             * The following resulted in a disabled function:
             * true, tRue, 1
             * The following resulted in an enabled function:
             * false, fAlse, 0, fdsaf, 2, undefined
             */
            // tslint:disable-next-line:strict-boolean-expressions
            this._disabled = /^(1|true)$/i.test(appSettings[key] || '');
        }
    }
}
