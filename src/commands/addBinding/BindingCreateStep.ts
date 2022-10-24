/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import { Progress, Uri, window, workspace } from "vscode";
import { IFunctionBinding, IFunctionJson } from "../../funcConfig/function";
import { IBindingTemplate } from "../../templates/IBindingTemplate";
import { confirmEditJsonFile } from '../../utils/fs';
import { nonNullProp } from "../../utils/nonNull";
import { verifyExtensionBundle } from "../../utils/verifyExtensionBundle";
import { getBindingSetting } from "../createFunction/IFunctionWizardContext";
import { IBindingWizardContext } from "./IBindingWizardContext";

export class BindingCreateStep extends AzureWizardExecuteStep<IBindingWizardContext> {
    public priority: number = 220;

    public async execute(context: IBindingWizardContext, _progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        const bindingTemplate: IBindingTemplate = nonNullProp(context, 'bindingTemplate');
        context.telemetry.properties.bindingType = bindingTemplate.type;
        context.telemetry.properties.bindingDirection = bindingTemplate.direction;

        const binding: IFunctionBinding = {};

        binding.type = bindingTemplate.type;
        binding.direction = bindingTemplate.direction;

        for (const b of bindingTemplate.settings) {
            if (getBindingSetting(context, b) !== "undefined") {
                binding[b.name] = getBindingSetting(context, b);
            }
        }

        await confirmEditJsonFile(context, context.functionJsonPath, (functionJson: IFunctionJson) => {
            functionJson.bindings = functionJson.bindings || [];
            functionJson.bindings.push(binding);
            return functionJson;
        });
        context.binding = binding;

        await verifyExtensionBundle(context, bindingTemplate);

        await window.showTextDocument(await workspace.openTextDocument(Uri.file(context.functionJsonPath)));
    }

    public shouldExecute(context: IBindingWizardContext): boolean {
        return !!context.bindingTemplate && !context.binding;
    }
}
