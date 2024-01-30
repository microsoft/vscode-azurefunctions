/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type ParsedSite } from "@microsoft/vscode-azext-azureappservice";
import { nonNullProp, nonNullValueAndProp } from "@microsoft/vscode-azext-utils";
import { type ResolvedAppResourceBase } from "@microsoft/vscode-azext-utils/hostapi";
import { type FuncHostRequest } from "./IProjectTreeItem";
import { type ContainerSite } from "./containerizedFunctionApp/ResolvedContainerizedFunctionAppResourceBase";

export abstract class ResolvedFunctionAppBase implements ResolvedAppResourceBase {
    public site: ContainerSite | ParsedSite;
    public constructor(site: ContainerSite | ParsedSite) {
        this.site = site;
    }

    public get id(): string {
        return nonNullProp(this.site, 'id');
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async getHostRequest(): Promise<FuncHostRequest> {
        return { url: nonNullValueAndProp(this.site, 'defaultHostUrl') }
    }
}
