/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, parseError } from "vscode-azureextensionui";
import { localize } from "../../../localize";
import { IPythonVenvWizardContext } from "./IPythonVenvWizardContext";
import { getPythonVersion, getSupportedPythonVersions, isSupportedPythonVersion } from './pythonVersion';

export class EnterPythonAliasStep extends AzureWizardPromptStep<IPythonVenvWizardContext> {
    public hideStepCount: boolean = true;

    public async prompt(context: IPythonVenvWizardContext): Promise<void> {
        const prompt: string = localize('pyAliasPlaceholder', 'Enter the Python interpreter or full path');
        const supportedVersions: string[] = await getSupportedPythonVersions(context.version);
        context.pythonAlias = await context.ui.showInputBox({ prompt, validateInput: async (value: string): Promise<string | undefined> => await validatePythonAlias(supportedVersions, value) });
    }

    public shouldPrompt(context: IPythonVenvWizardContext): boolean {
        return !!context.manuallyEnterAlias && !context.useExistingVenv && !context.pythonAlias;
    }
}

async function validatePythonAlias(supportedVersions: string[], pyAlias: string): Promise<string | undefined> {
    let pyVersion: string;
    try {
        pyVersion = await getPythonVersion(pyAlias);
    } catch (error) {
        return parseError(error).message;
    }

    if (isSupportedPythonVersion(supportedVersions, pyVersion)) {
        return undefined;
    } else {
        const supportedVersionsString: string = supportedVersions.map(v => `"${v}.x"`).join(', ');
        return localize('notMatchingVersion', 'Python version "{0}" does not match supported versions: {1}', pyVersion, supportedVersionsString);
    }
}
