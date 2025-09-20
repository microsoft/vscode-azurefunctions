/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from '@microsoft/vscode-azext-utils';
import { hasFuncCliSetting } from '../../funcCoreTools/getFuncCliPath';
import { type IPreDebugValidateContext } from './IPreDebugValidateContext';

export class FunctionsCoreToolsInstallStep<T extends IPreDebugValidateContext> extends AzureWizardPromptStep<T> {
    public async prompt(context: T): Promise<void> {
        if (hasFuncCliSetting()) {
            // Defer to the func cli path setting instead of checking here
            // For example, if the path is set to something like "node_modules/.bin/func", that may not exist until _after_ an "npm install" task is run
            context.telemetry.properties.funcCliSource = 'setting';
            return;
        }
    }

    public shouldPrompt(context: T): boolean {
        return context.isFuncCoreToolsInstalled === undefined;
    }
}
