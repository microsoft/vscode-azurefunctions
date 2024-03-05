/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CodeLens, Range, type CodeLensProvider } from 'vscode';
import { localize } from '../../../localize';

export class EventGridCodeLensProvider implements CodeLensProvider {
    public provideCodeLenses(): CodeLens[] {
        const firstLineLens = new CodeLens(new Range(0, 0, 0, 0));

        firstLineLens.command = {
            title: localize('saveExecute', 'Save and execute'),
            command: 'azureFunctions.eventGrid.sendMockRequest',
        };

        return [firstLineLens];
    }
}
