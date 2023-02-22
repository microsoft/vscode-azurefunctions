/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from "@microsoft/vscode-azext-utils";
import { InputBoxOptions } from "vscode";
import { localize } from "../../../localize";
import { IBallerinaProjectWizardContext } from "./IBallerinaProjectWizardContext";

export class BalPackageVersionStep extends AzureWizardPromptStep<IBallerinaProjectWizardContext> {
    public async prompt(context: IBallerinaProjectWizardContext): Promise<void> {
        const options: InputBoxOptions = {
            placeHolder: localize('packageVersionPlaceHolder', 'Package Version'),
            prompt: localize('packageVersionPrompt', 'Provide the version of the ballerina package'),
            value: '1.0.0'
        };
        context.balVersion = await context.ui.showInputBox(options);
    }

    public shouldPrompt(context: IBallerinaProjectWizardContext): boolean {
        return !context.balVersion;
    }
}
