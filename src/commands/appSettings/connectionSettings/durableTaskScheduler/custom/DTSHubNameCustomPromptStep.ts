/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, validationUtils, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { ConnectionKey, ConnectionType, localSettingsFileName } from '../../../../../constants';
import { getLocalSettingsJson } from '../../../../../funcConfig/local.settings';
import { localize } from '../../../../../localize';
import { type IDTSConnectionWizardContext } from '../IDTSConnectionWizardContext';

export class DTSHubNameCustomPromptStep<T extends IDTSConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        context.newDTSHubNameConnectionSetting = (await context.ui.showInputBox({
            prompt: localize('customDTSConnectionPrompt', 'Provide the custom DTS hub name.'),
            value: await getDTSHubName(context, context.projectPath),
            validateInput: (value: string) => this.validateInput(value)
        })).trim();
    }

    public shouldPrompt(context: T): boolean {
        return !context.newDTSHubNameConnectionSetting && context.dtsConnectionType === ConnectionType.Custom;
    }

    private validateInput(name: string): string | undefined {
        name = name.trim();

        if (!validationUtils.hasValidCharLength(name)) {
            return validationUtils.getInvalidCharLengthMessage();
        }
        return undefined;
    }
}

async function getDTSHubName(context: IActionContext, projectPath: string): Promise<string | undefined> {
    const localSettingsJson = await getLocalSettingsJson(context, path.join(projectPath, localSettingsFileName));
    return localSettingsJson.Values?.[ConnectionKey.DTSHub];
}
