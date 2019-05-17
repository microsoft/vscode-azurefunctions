/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Progress, Uri, window, workspace } from "vscode";
import { AzureWizardExecuteStep } from "vscode-azureextensionui";
import { IFunctionBinding, IFunctionJson } from "../../funcConfig/function";
import { IBindingTemplate } from "../../templates/IBindingTemplate";
import { confirmEditJsonFile } from '../../utils/fs';
import { nonNullProp } from "../../utils/nonNull";
import { getBindingSetting } from "../createFunction/IFunctionWizardContext";
import { IBindingWizardContext } from "./IBindingWizardContext";

export class BindingCreateStep extends AzureWizardExecuteStep<IBindingWizardContext> {
    public priority: number = 220;

    public async execute(wizardContext: IBindingWizardContext, _progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        const bindingTemplate: IBindingTemplate = nonNullProp(wizardContext, 'bindingTemplate');
        wizardContext.properties.bindingType = bindingTemplate.type;
        wizardContext.properties.bindingDirection = bindingTemplate.direction;

        const binding: IFunctionBinding = {};

        binding.type = bindingTemplate.type;
        binding.direction = bindingTemplate.direction;

        for (const b of bindingTemplate.settings) {
            binding[b.name] = getBindingSetting(wizardContext, b);
        }

        await confirmEditJsonFile(wizardContext.functionJsonPath, (functionJson: IFunctionJson) => {
            // tslint:disable-next-line: strict-boolean-expressions
            functionJson.bindings = functionJson.bindings || [];
            functionJson.bindings.push(binding);
            return functionJson;
        });
        wizardContext.binding = binding;

        window.showTextDocument(await workspace.openTextDocument(Uri.file(wizardContext.functionJsonPath)));
    }

    public shouldExecute(wizardContext: IBindingWizardContext): boolean {
        return !!wizardContext.bindingTemplate && !wizardContext.binding;
    }
}
