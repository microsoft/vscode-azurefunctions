/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/
import { AzureWizardPromptStep, DialogResponses, openUrl, type IActionContext } from "@microsoft/vscode-azext-utils";
import { type MessageItem } from "vscode";
import { funcVersionLink } from "../../../FuncVersion";
import { localize } from "../../../localize";
import { getWorkspaceSetting, updateGlobalSetting } from "../../../vsCodeConfig/settings";
import { type IFunctionAppWizardContext } from "../IFunctionAppWizardContext";

export class FunctionAppEOLWarningStep extends AzureWizardPromptStep<IFunctionAppWizardContext> {
    public async prompt(context: IFunctionAppWizardContext): Promise<void> {
        const settingKey: string = 'endOfLifeWarning';
        if (getWorkspaceSetting<boolean>(settingKey)) {
            let result: MessageItem = await this.showEOLWarningMessage(context);
            while (result === DialogResponses.learnMore) {
                await openUrl(funcVersionLink);
                result = await this.showEOLWarningMessage(context);
            }

            if (result === DialogResponses.dontWarnAgain) {
                await updateGlobalSetting(settingKey, false);
            }
        }
    }

    public shouldPrompt(context: IFunctionAppWizardContext): boolean {
        return !!context.newSiteStack;
    }

    private async showEOLWarningMessage(context: IActionContext): Promise<MessageItem> {
        const message = localize('endOfLife', "The chosen runtime stack has an end of support deadline coming up. " +
            "After the deadline, function apps can be created and deployed, and existing apps continue to run. " +
            "However, your apps won't be eligible for new features, security patches, performance optimizations, and support until you upgrade them.");
        const continueOn: MessageItem = { title: localize('continueOn', 'Continue') };
        return await context.ui.showWarningMessage(message, { modal: true }, DialogResponses.learnMore, continueOn, DialogResponses.dontWarnAgain);
    }
}
