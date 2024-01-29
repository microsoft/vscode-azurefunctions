/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type Site } from "@azure/arm-appservice";
import { type ParsedSite } from "@microsoft/vscode-azext-azureappservice";
import { nonNullProp } from "@microsoft/vscode-azext-utils";
import { type ResolvedAppResourceBase } from "@microsoft/vscode-azext-utils/hostapi";

export abstract class ResolvedFunctionAppBase implements ResolvedAppResourceBase {
    public site: Site | ParsedSite;
    public constructor(site: Site | ParsedSite) {
        this.site = site;
    }

    public get id(): string {
        return nonNullProp(this.site, 'id');
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }
}
