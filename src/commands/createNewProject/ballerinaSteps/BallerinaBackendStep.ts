/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type IAzureQuickPickItem } from "@microsoft/vscode-azext-utils";
import { BallerinaBackend } from "../../../constants";
import { localize } from "../../../localize";
import { type IBallerinaProjectWizardContext } from "./IBallerinaProjectWizardContext";

export class BallerinaBackendStep extends AzureWizardPromptStep<IBallerinaProjectWizardContext> {

    public async prompt(context: IBallerinaProjectWizardContext): Promise<void> {
        const picks: IAzureQuickPickItem<BallerinaBackend>[] = [
            { label: 'JVM', data: BallerinaBackend.jvm },
            { label: 'Native', data: BallerinaBackend.native },
        ];
        const placeHolder: string = localize('selectBallerinaBackend', 'Select the backend for Ballerina project');
        context.balBackend = (await context.ui.showQuickPick(picks, { placeHolder })).data;
    }

    public shouldPrompt(context: IBallerinaProjectWizardContext): boolean {
        return !context.balBackend;
    }
}
