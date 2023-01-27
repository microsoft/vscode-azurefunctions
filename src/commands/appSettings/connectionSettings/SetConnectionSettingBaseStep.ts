/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import { CodeAction, ConnectionKeyValues } from "../../../constants";
import { MismatchBehavior, setLocalAppSetting } from "../../../funcConfig/local.settings";
import { ISetConnectionSettingContext } from "./ISetConnectionSettingContext";

export abstract class SetConnectionSettingBaseStep<T extends ISetConnectionSettingContext> extends AzureWizardExecuteStep<T> {
    public abstract readonly debugDeploySetting: ConnectionKeyValues;

    protected async setConnectionSetting(context: T, value: string): Promise<void> {
        if (context.action === CodeAction.Deploy) {
            context[this.debugDeploySetting] = value;
        } else {
            await setLocalAppSetting(context, context.projectPath, this.debugDeploySetting, value, MismatchBehavior.Overwrite);
        }
    }
}
