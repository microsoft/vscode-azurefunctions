/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullProp } from "@microsoft/vscode-azext-utils";
import { showMarkdownPreviewContent } from "../../../utils/textUtils";
import { FunctionWizardV2Context } from "../FunctionV2WizardContext";
import { ActionSchemaBaseStep } from "./ActionSchemaBaseStep";

export class ShowMarkdownPreviewExecuteStep<T extends FunctionWizardV2Context> extends ActionSchemaBaseStep<T> {
    public async executeAction(context: T): Promise<void> {
        const filename = nonNullProp(this.action, 'filePath');
        const content = context.functionTemplateV2?.files[filename] || '';
        await showMarkdownPreviewContent(content, filename, /* openToSide: */ true);
    }
}
