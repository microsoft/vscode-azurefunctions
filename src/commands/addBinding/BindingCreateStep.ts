/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStepWithActivityOutput } from "@microsoft/vscode-azext-utils";
import { Uri, window, workspace, type Progress } from "vscode";
import { type IFunctionBinding, type IFunctionJson } from "../../funcConfig/function";
import { localize } from "../../localize";
import { type IBindingTemplate } from "../../templates/IBindingTemplate";
import { confirmEditJsonFile } from '../../utils/fs';
import { nonNullProp } from "../../utils/nonNull";
import { verifyExtensionBundle } from "../../utils/verifyExtensionBundle";
import { getBindingSetting } from "../createFunction/IFunctionWizardContext";
import { type IBindingWizardContext } from "./IBindingWizardContext";

export class BindingCreateStep extends AzureWizardExecuteStepWithActivityOutput<IBindingWizardContext> {
    public priority: number = 220;
    stepName = 'bindingCreateStep';
    public getTreeItemLabel(context: IBindingWizardContext): string {
        const bindingTemplate: IBindingTemplate = nonNullProp(context, 'bindingTemplate');
        return localize('addBinding', 'Add {0} binding', bindingTemplate.type);
    }
    public getOutputLogSuccess(context: IBindingWizardContext): string {
        const bindingTemplate: IBindingTemplate = nonNullProp(context, 'bindingTemplate');
        return localize('addBindingSuccess', 'Successfully added {0} binding.', bindingTemplate.type);
    }
    public getOutputLogFail(context: IBindingWizardContext): string {
        const bindingTemplate: IBindingTemplate = nonNullProp(context, 'bindingTemplate');
        return localize('addBindingFail', 'Failed to add {0} binding.', bindingTemplate.type);
    }
    public getOutputLogProgress(context: IBindingWizardContext): string {
        const bindingTemplate: IBindingTemplate = nonNullProp(context, 'bindingTemplate');
        return localize('addingBinding', 'Adding {0} binding...', bindingTemplate.type);
    }

    public async execute(context: IBindingWizardContext, _progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        const bindingTemplate: IBindingTemplate = nonNullProp(context, 'bindingTemplate');
        context.telemetry.properties.bindingType = bindingTemplate.type;
        context.telemetry.properties.bindingDirection = bindingTemplate.direction;

        const binding: IFunctionBinding = {};

        binding.type = bindingTemplate.type;
        binding.direction = bindingTemplate.direction;

        for (const b of bindingTemplate.settings) {
            const bindingSetting = getBindingSetting(context, b);
            if (!b.required && (typeof bindingSetting !== 'boolean' && (!bindingSetting || bindingSetting === 'undefined'))) {
                // skip this value because it's optional and invalid
            } else {
                binding[b.name] = bindingSetting;
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
