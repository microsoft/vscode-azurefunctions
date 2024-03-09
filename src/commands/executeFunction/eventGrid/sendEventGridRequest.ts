/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { ext } from '../../../extensionVariables';
import { localize } from '../../../localize';
import { executeFunctionWithInput } from '../executeFunction';

export async function sendEventGridRequest(context: IActionContext) {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        const errorMsg = localize('noActiveTextEditor', 'No active text editor found.');
        throw new Error(errorMsg);
    }
    const document = activeEditor.document;
    await document.save();
    const requestContent: string = document.getText();

    const node = ext.fileToFunctionNodeMap.get(document.fileName);

    if (!node) {
        const errorMsg = localize(
            'noFunctionBeingExecuted',
            'No function is currently being executed. ' +
            'This command is intended to be run while an EventGrid function is being executed. ' +
            'Please make sure to execute your EventGrid function.',
        );
        throw new Error(errorMsg);
    }

    await executeFunctionWithInput(context, requestContent, node);
}
