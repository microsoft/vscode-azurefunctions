/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference lib="dom" />

import { Button, Card } from '@fluentui/react-components';
import { useConfiguration, WebviewContext } from '@microsoft/vscode-azext-webview/webview';
import { useContext, useMemo, useState, type JSX } from 'react';
import { ConnectorTilePicker } from './ConnectorTilePicker';
import { type ConnectorTriggerPickerViewModel } from './ConnectorTriggerPickerViewModel';

export function ConnectorTriggerPickerView(): JSX.Element {
    const viewModel = useConfiguration<ConnectorTriggerPickerViewModel>();
    const { vscodeApi } = useContext(WebviewContext);
    const [selectedConnectorId, setSelectedConnectorId] = useState('');
    const selectedConnector = useMemo(
        () => viewModel.connectors.find(connector => connector.id === selectedConnectorId),
        [selectedConnectorId, viewModel.connectors],
    );

    return (
        <main className="page">
            <header className="header">
                <div>
                    <h1>{viewModel.labels.title}</h1>
                    <p>{viewModel.labels.description}</p>
                </div>
            </header>

            <Card className="card" appearance="outline">
                <ConnectorTilePicker
                    label={viewModel.labels.connectorGroup}
                    options={viewModel.connectors}
                    value={selectedConnectorId}
                    onChange={setSelectedConnectorId}
                />
            </Card>

            <footer className="footer">
                <div className="selection" aria-live="polite">
                    {selectedConnector &&
                        <><strong>{viewModel.labels.selectedConnector}:</strong> {selectedConnector.label}</>
                    }
                </div>
                <div className="actions">
                    <Button
                        appearance="secondary"
                        onClick={() => vscodeApi.postMessage({ command: 'close' })}
                    >
                        {viewModel.labels.close}
                    </Button>
                    <Button
                        appearance="primary"
                        disabled={!selectedConnector}
                        onClick={() => selectedConnector && vscodeApi.postMessage({
                            command: 'continue',
                            connectorId: selectedConnector.id,
                        })}
                    >
                        {viewModel.labels.continue}
                    </Button>
                </div>
            </footer>
        </main>
    );
}
