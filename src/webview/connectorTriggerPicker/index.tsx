/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference lib="dom" />

import { createRoot } from 'react-dom/client';
import './connectorTriggerPicker.css';
import { ConnectorTriggerPickerView } from './ConnectorTriggerPickerView';
import { type ConnectorTriggerPickerViewModel } from './ConnectorTriggerPickerViewModel';

interface VsCodeApi {
    postMessage(message: unknown): void;
}

declare global {
    interface Window {
        config?: {
            _initialData?: string;
        };
    }
}

export function render(viewName: string, vscodeApi: VsCodeApi): void {
    if (viewName !== 'connectorTriggerPicker') {
        throw new Error(`Unsupported webview: ${viewName}`);
    }

    const container = document.getElementById('root');
    if (!container) {
        throw new Error('Webview root element was not found.');
    }

    const config = JSON.parse(
        decodeURIComponent(window.config?._initialData ?? '{}'),
    ) as ConnectorTriggerPickerViewModel;
    document.title = config.labels.panelTitle;

    createRoot(container).render(
        <ConnectorTriggerPickerView viewModel={config} vscodeApi={vscodeApi} />,
    );
}
