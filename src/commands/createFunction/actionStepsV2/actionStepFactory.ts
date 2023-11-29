/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
import { ActionType } from "../../../constants";
import { type ParsedAction } from "../../../templates/script/parseScriptTemplatesV2";
import { type FunctionV2WizardContext } from "../IFunctionWizardContext";
import { AppendToFileExecuteStep } from "./AppendToFileExecuteStep";
import { GetTemplateFileContentExecuteStep } from "./GetTemplateFileContentExecuteStep";
import { ShowMarkdownPreviewExecuteStep } from "./ShowMarkdownPreviewExecuteStep";
import { WriteToFileExecuteStep } from "./WriteToFileExecuteStep";

export function actionStepFactory<T extends FunctionV2WizardContext>(action: ParsedAction, priority: number): AzureWizardExecuteStep<T> {
    switch (action.type) {
        case ActionType.AppendToFile:
            return new AppendToFileExecuteStep(action, priority);
        case ActionType.GetTemplateFileContent:
            return new GetTemplateFileContentExecuteStep(action, priority);
        case ActionType.ShowMarkdownPreview:
            return new ShowMarkdownPreviewExecuteStep(action, priority);
        case ActionType.WriteToFile:
            return new WriteToFileExecuteStep(action, priority);
        default:
            throw new Error(`Unrecognized action type "${action.type}"`);
    }
}
