import { CodeLens, CodeLensProvider, Range } from 'vscode';
import { localize } from '../../localize';

export class EventGridCodeLensProvider implements CodeLensProvider {
    public provideCodeLenses(): CodeLens[] {
        const sendRequestLens = new CodeLens(new Range(0, 0, 0, 0));
        sendRequestLens.command = {
            title: localize('saveSendRequest', 'Save and send request'),
            command: 'azureFunctions.eventGrid.sendMockRequest',
        };

        return [sendRequestLens];
    }
}
