/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISubscriptionContext } from "vscode-azureextensionui";
import { IBindingSetting } from "../../templates/IBindingTemplate";
import { IFunctionTemplate } from "../../templates/IFunctionTemplate";
import { IProjectWizardContext } from "../createNewProject/IProjectWizardContext";

export interface IFunctionWizardContext extends Partial<ISubscriptionContext>, IProjectWizardContext {
    functionTemplate?: IFunctionTemplate;
    functionName?: string;
}

export function setBindingSetting(context: IFunctionWizardContext, setting: IBindingSetting, value: string | undefined): void {
    context[setting.name.toLowerCase()] = value;
}

export function getBindingSetting(context: IFunctionWizardContext, setting: IBindingSetting): string | undefined {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const value: string | undefined = context[setting.name.toLowerCase()];
    if (value) {
        return value;
    } else {
        return setting.required ? '' : undefined;
    }
}
