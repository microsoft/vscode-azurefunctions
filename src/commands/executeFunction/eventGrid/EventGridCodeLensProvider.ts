/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CodeLens, Range, type CodeLensProvider, type TextDocument } from 'vscode';
import { localize } from '../../../localize';

export class EventGridCodeLensProvider implements CodeLensProvider {
    public provideCodeLenses(document: TextDocument): CodeLens[] {
        const firstLineLens = new CodeLens(new Range(0, 0, 0, 0));
        const lastLine = document.lineAt(document.lineCount - 1);
        const lastLineLens = new CodeLens(new Range(lastLine.range.start, lastLine.range.end));

        const command = {
            title: localize('saveSendRequest', 'Save and execute'),
            command: 'azureFunctions.eventGrid.sendMockRequest',
        };
        firstLineLens.command = lastLineLens.command = command;

        return [firstLineLens, lastLineLens];
    }
}
