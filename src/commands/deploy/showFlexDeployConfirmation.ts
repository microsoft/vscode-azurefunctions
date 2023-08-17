/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDeployContext, ParsedSite, showCustomDeployConfirmation } from "@microsoft/vscode-azext-azureappservice";
import { MessageItem } from "vscode";
import { localize } from "../../localize";

export async function showFlexDeployConfirmation(context: IDeployContext, site: ParsedSite, deployCommandId: string): Promise<void> {
    // Waiting for public preview before pointing users to any documentation
    // const learnMoreLink: string = 'https://aka.ms/flexconsumption-remotebuild';
    const remoteDeploy: MessageItem = { title: localize('remoteDeploy', 'Deploy with Remote Build ') };
    const input: MessageItem = await showCustomDeployConfirmation(context, site, deployCommandId, { items: [remoteDeploy] });
    context.flexConsumptionRemoteBuild = false;
    // We should allow users to have a "don't ask again option" for public preview
    if (input === remoteDeploy) {
        context.flexConsumptionRemoteBuild = true;
    }
}
