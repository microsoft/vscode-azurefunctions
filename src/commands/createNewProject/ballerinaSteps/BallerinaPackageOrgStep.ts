/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { InputBoxOptions } from "vscode";
import { localize } from "../../../localize";
import { IBallerinaProjectWizardContext } from "./IBallerinaProjectWizardContext";

export class BalPackageOrgStep extends AzureWizardPromptStep<IBallerinaProjectWizardContext> {
    public async prompt(context: IBallerinaProjectWizardContext): Promise<void> {
        const options: InputBoxOptions = {
            placeHolder: localize('packageOrgPlaceHolder', 'Package Organization'),
            prompt: localize('packageOrgPrompt', 'Provide the organization name for the ballerina package'),
            value: 'my_org'
        };
        context.balOrgName = await context.ui.showInputBox(options);
    }

    public shouldPrompt(context: IBallerinaProjectWizardContext): boolean {
        return !context.balOrgName;
    }
}
