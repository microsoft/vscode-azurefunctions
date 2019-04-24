/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISubscriptionWizardContext } from "vscode-azureextensionui";
import { IBindingSetting } from "../../templates/IBindingTemplate";
import { IFunctionTemplate } from "../../templates/IFunctionTemplate";
import { IProjectWizardContext } from "../createNewProject/IProjectWizardContext";

export interface IFunctionWizardContext extends Partial<ISubscriptionWizardContext>, IProjectWizardContext {
    functionTemplate?: IFunctionTemplate;
    functionName?: string;
}

export function setBindingSetting(wizardContext: IFunctionWizardContext, setting: IBindingSetting, value: string | undefined): void {
    wizardContext[setting.name.toLowerCase()] = value;
}

export function getBindingSetting(wizardContext: IFunctionWizardContext, setting: IBindingSetting): string | undefined {
    // tslint:disable-next-line: no-unsafe-any
    const value: string | undefined = wizardContext[setting.name.toLowerCase()];
    if (value) {
        return value;
    } else {
        return setting.required ? '' : undefined;
    }
}
