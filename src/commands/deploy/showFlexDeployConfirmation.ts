/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDeployContext, ParsedSite, showCustomDeployConfirmation } from "@microsoft/vscode-azext-azureappservice";
import { MessageItem } from "vscode";
import { localize } from "../../localize";

export async function showFlexDeployConfirmation(context: IDeployContext, site: ParsedSite, deployCommandId: string): Promise<void> {
    const learnMoreLink: string = 'https://aka.ms/flexconsumption-remotebuild';
    const remoteDeploy: MessageItem = { title: localize('remoteDeploy', 'Deploy with Remote Build ') };
    const input: MessageItem = await showCustomDeployConfirmation(context, site, deployCommandId, { items: [remoteDeploy], learnMoreLink });

    // TODO: Allow users to have a "don't ask again option"
    if (input === remoteDeploy) {
        context.flexConsumptionRemoteBuild = true;
    }
}
