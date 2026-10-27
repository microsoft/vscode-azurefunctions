/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference lib="dom" />

import { useMemo, useState, type JSX } from 'react';
import { ConnectorTilePicker } from './ConnectorTilePicker';
import { type ConnectorTriggerPickerViewModel } from './ConnectorTriggerPickerViewModel';

export interface ConnectorTriggerPickerViewProps {
    viewModel: ConnectorTriggerPickerViewModel;
    vscodeApi: {
        postMessage(message: unknown): void;
    };
}

export function ConnectorTriggerPickerView({
    viewModel,
    vscodeApi,
}: ConnectorTriggerPickerViewProps): JSX.Element {
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

            <section className="card">
                <ConnectorTilePicker
                    label={viewModel.labels.connectorGroup}
                    options={viewModel.connectors}
                    value={selectedConnectorId}
                    onChange={setSelectedConnectorId}
                />
            </section>

            <footer className="footer">
                <div className="selection" aria-live="polite">
                    {selectedConnector &&
                        <><strong>{viewModel.labels.selectedConnector}:</strong> {selectedConnector.label}</>
                    }
                </div>
                <div className="actions">
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={() => vscodeApi.postMessage({ type: 'close' })}
                    >
                        {viewModel.labels.close}
                    </button>
                    <button
                        type="button"
                        className="primary-button"
                        disabled={!selectedConnector}
                        onClick={() => selectedConnector && vscodeApi.postMessage({
                            type: 'continue',
                            connectorId: selectedConnector.id,
                        })}
                    >
                        {viewModel.labels.continue}
                    </button>
                </div>
            </footer>
        </main>
    );
}
