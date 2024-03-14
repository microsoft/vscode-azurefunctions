/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, UserCancelledError, type IAzureQuickPickItem, type IWizardOptions } from "@microsoft/vscode-azext-utils";
import { l10n } from "vscode";
import { validateFuncCoreToolsInstalled } from "../../funcCoreTools/validateFuncCoreToolsInstalled";
import { localize } from "../../localize";
import { type IFunctionWizardContext } from "../createFunction/IFunctionWizardContext";
import { CreateDockerfileProjectStep } from "./dockerfileSteps/CreateDockerfileProjectStep";

export class ProjectTypeListStep extends AzureWizardPromptStep<IFunctionWizardContext> {
    public async prompt(context: IFunctionWizardContext): Promise<void> {
        context.containerizedProject = (await context.ui.showQuickPick(this.getPicks(), { placeHolder: l10n.t('Select a project type') })).data;
    }

    public shouldPrompt(): boolean {
        return true;
    }

    public async getSubWizard(context: IFunctionWizardContext): Promise<IWizardOptions<IFunctionWizardContext> | undefined> {
        if (context.containerizedProject) {
            const message: string = localize('installFuncTools', 'You must have the Azure Functions Core Tools installed to run this command.');
            if (!await validateFuncCoreToolsInstalled(context, message)) {
                throw new UserCancelledError('validateFuncCoreToolsInstalled');
            }
            context.languageFilter = /Python|C\#|(Java|Type)Script|PowerShell$/i;
            return { executeSteps: [new CreateDockerfileProjectStep()] };
        } else {
            return undefined;
        }
    }

    private getPicks(): IAzureQuickPickItem<boolean>[] {
        return [
            { label: l10n.t('Create default function project'), description: l10n.t('Recommended'), data: false },
            { label: l10n.t('Generate project with a Dockerfile'), description: l10n.t('Creates a project that will run in a Linux container'), data: true }
        ];
    }
}
