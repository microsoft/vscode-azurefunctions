/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type FunctionEnvelope } from "@azure/arm-appservice";
import { type IActionContext } from "@microsoft/vscode-azext-utils";
import * as url from "url";
import { HttpAuthLevel, type ParsedFunctionJson } from "../funcConfig/function";
import { type IParsedHostJson } from "../funcConfig/host";
import { type IFunction } from "../workspace/LocalFunction";
import { type FuncHostRequest, type IProjectTreeItem } from "./IProjectTreeItem";

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
