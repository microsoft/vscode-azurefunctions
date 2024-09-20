/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullProp } from "@microsoft/vscode-azext-utils";
import { assertTemplateIsV2 } from "../../../utils/templateVersionUtils";
import { showMarkdownPreviewContent } from "../../../utils/textUtils";
import { getWorkspaceSetting } from "../../../vsCodeConfig/settings";
import { type FunctionV2WizardContext } from "../IFunctionWizardContext";
import { ActionSchemaStepBase } from "./ActionSchemaStepBase";

export class ShowMarkdownPreviewExecuteStep<T extends FunctionV2WizardContext> extends ActionSchemaStepBase<T> {
    public async executeAction(context: T): Promise<void> {
        assertTemplateIsV2(context.functionTemplate);

        const filename = nonNullProp(this.action, 'filePath');
        const content = context.functionTemplate.files[filename] ?? '';
        await showMarkdownPreviewContent(content, filename, /* openToSide: */ true);
    }

    public shouldExecute(_context: T): boolean {
        return !!getWorkspaceSetting('showMarkdownPreview');
    }
}
