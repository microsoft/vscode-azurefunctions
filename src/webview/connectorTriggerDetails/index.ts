/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference lib="dom" />

import './connectorTriggerDetails.css';
import {
    type ConnectorTriggerCopyField,
    type ConnectorTriggerCopyableValue,
    type ConnectorTriggerDetailsViewModel,
    type ConnectorTriggerDetailValue,
} from './ConnectorTriggerDetailsViewModel';

interface VsCodeApi {
    postMessage(message: unknown): void;
}

interface CopyResultMessage {
    type: 'copyResult';
    field: ConnectorTriggerCopyField;
    success: boolean;
}

declare global {
    interface Window {
        config?: {
            _initialData?: string;
        };
    }
}

export function render(viewName: string, vscodeApi: VsCodeApi): void {
    if (viewName !== 'connectorTriggerDetails') {
        throw new Error(`Unsupported webview: ${viewName}`);
    }

    const root = document.getElementById('root');
    if (!root) {
        throw new Error('Webview root element was not found.');
    }

    const viewModel = getViewModel();
    document.title = viewModel.labels.panelTitle;
    root.replaceChildren(createDetailsView(viewModel, vscodeApi));
}

function getViewModel(): ConnectorTriggerDetailsViewModel {
    const initialData = window.config?._initialData;
    if (!initialData) {
        throw new Error('Connector trigger detail data was not provided.');
    }

    return JSON.parse(decodeURIComponent(initialData)) as ConnectorTriggerDetailsViewModel;
}

function createDetailsView(viewModel: ConnectorTriggerDetailsViewModel, vscodeApi: VsCodeApi): HTMLElement {
    const main = element('main', 'page');
    main.append(createHero(viewModel, vscodeApi));
    main.append(createContextMessage(viewModel.contextMessage));

    const content = element('div', 'content-grid');
    const primary = element('div', 'content-column');
    primary.append(
        createSection(viewModel.labels.overview, [
            detailRow(viewModel.labels.name, viewModel.overview.name),
            detailRow(viewModel.labels.description, viewModel.overview.description),
            detailRow(viewModel.labels.location, viewModel.overview.location),
        ]),
        createConfigurationSection(viewModel),
    );

    const secondary = element('div', 'content-column');
    secondary.append(
        createPollingEndpointSection(viewModel, vscodeApi),
        createSection(viewModel.labels.deliveryInformation, [
            detailRow(viewModel.labels.deliveryMode, viewModel.delivery.mode),
            detailRow(viewModel.labels.latestPoll, viewModel.delivery.latestPoll),
            detailRow(viewModel.labels.pendingMessages, viewModel.delivery.pendingMessages),
        ], 'metric-grid'),
    );

    content.append(primary, secondary);
    main.append(content, createMessageHistorySection(viewModel));
    return main;
}

function createHero(viewModel: ConnectorTriggerDetailsViewModel, vscodeApi: VsCodeApi): HTMLElement {
    const header = element('header', 'hero');
    const copy = element('div', 'hero-copy');
    copy.append(
        textElement('h1', 'hero-title', viewModel.title),
        textElement('p', 'hero-description', viewModel.description),
    );

    const actions = element('div', 'hero-actions');
    actions.append(
        button(viewModel.labels.close, 'secondary-button', () => vscodeApi.postMessage({ type: 'close' })),
        button(viewModel.labels.continue, 'primary-button', () => vscodeApi.postMessage({ type: 'continue' })),
    );
    header.append(copy, actions);
    return header;
}

function createContextMessage(message: string): HTMLElement {
    const callout = element('div', 'context-message');
    callout.setAttribute('role', 'note');
    callout.append(textElement('p', undefined, message));
    return callout;
}

function createConfigurationSection(viewModel: ConnectorTriggerDetailsViewModel): HTMLElement {
    const rows = [
        detailRow(viewModel.labels.connection, viewModel.configuration.connection),
        detailRow(viewModel.labels.authenticatedUser, viewModel.configuration.authenticatedUser),
        detailRow(viewModel.labels.status, viewModel.configuration.status),
        detailRow(viewModel.labels.event, viewModel.configuration.event),
    ];

    const parameters = element('div', 'parameters');
    parameters.append(textElement('h3', 'subsection-title', viewModel.labels.triggerParameters));
    if (viewModel.configuration.triggerParameters.length === 0) {
        parameters.append(textElement('p', 'empty-inline', viewModel.labels.noTriggerParameters));
    } else {
        const list = element('dl', 'detail-list');
        for (const parameter of viewModel.configuration.triggerParameters) {
            list.append(
                textElement('dt', 'detail-label', parameter.name),
                textElement('dd', 'detail-value', parameter.value),
            );
        }
        parameters.append(list);
    }

    const section = createSection(viewModel.labels.configuration, rows);
    section.append(parameters);
    return section;
}

function createPollingEndpointSection(viewModel: ConnectorTriggerDetailsViewModel, vscodeApi: VsCodeApi): HTMLElement {
    const section = createSection(viewModel.labels.pollingEndpoint, []);
    section.append(textElement('p', 'section-description', viewModel.labels.pollingEndpointDescription));

    const fields = element('div', 'endpoint-fields');
    fields.append(
        copyableRow('baseUrl', viewModel.labels.baseUrl, viewModel.pollingEndpoint.baseUrl, viewModel, vscodeApi),
        copyableRow(
            'triggerConfigurationName',
            viewModel.labels.triggerConfigurationName,
            viewModel.pollingEndpoint.triggerConfigurationName,
            viewModel,
            vscodeApi,
        ),
    );
    section.append(fields);
    return section;
}

function createMessageHistorySection(viewModel: ConnectorTriggerDetailsViewModel): HTMLElement {
    const section = createSection(viewModel.labels.messageHistory, []);
    if (viewModel.messageHistory.length === 0) {
        const emptyState = element('div', 'empty-state');
        emptyState.append(
            textElement('h3', 'empty-title', viewModel.labels.emptyMessageHistoryTitle),
            textElement('p', 'empty-description', viewModel.labels.emptyMessageHistoryDescription),
        );
        section.append(emptyState);
        return section;
    }

    const tableWrapper = element('div', 'table-wrapper');
    const table = element('table', 'history-table');
    const head = element('thead');
    const headerRow = element('tr');
    for (const label of [
        viewModel.labels.messageReceivedAt,
        viewModel.labels.messageStatus,
        viewModel.labels.messageResult,
    ]) {
        headerRow.append(textElement('th', undefined, label));
    }
    head.append(headerRow);

    const body = element('tbody');
    for (const item of viewModel.messageHistory) {
        const row = element('tr');
        row.append(
            textElement('td', undefined, item.receivedAt),
            textElement('td', undefined, item.status),
            textElement('td', undefined, item.result),
        );
        body.append(row);
    }
    table.append(head, body);
    tableWrapper.append(table);
    section.append(tableWrapper);
    return section;
}

function createSection(title: string, rows: readonly HTMLElement[], bodyClassName?: string): HTMLElement {
    const section = element('section', 'card');
    section.append(textElement('h2', 'section-title', title));
    if (rows.length > 0) {
        const body = element('div', bodyClassName ?? 'detail-list');
        body.append(...rows);
        section.append(body);
    }
    return section;
}

function detailRow(label: string, value: ConnectorTriggerDetailValue): HTMLElement {
    const row = element('div', 'detail-row');
    row.append(
        textElement('span', 'detail-label', label),
        textElement('span', `detail-value tone-${value.tone}`, value.text),
    );
    return row;
}

function copyableRow(
    field: ConnectorTriggerCopyField,
    label: string,
    value: ConnectorTriggerCopyableValue,
    viewModel: ConnectorTriggerDetailsViewModel,
    vscodeApi: VsCodeApi,
): HTMLElement {
    const row = element('div', 'copy-row');
    row.append(textElement('span', 'detail-label', label));

    const valueRow = element('div', 'copy-value-row');
    valueRow.append(textElement('code', `copy-value tone-${value.tone}`, value.text));
    const copyButton = button(
        viewModel.labels.copy,
        'copy-button',
        () => vscodeApi.postMessage({ type: 'copy', field }),
        !value.copyValue,
    );
    copyButton.dataset.copyField = field;
    if (!value.copyValue) {
        copyButton.title = viewModel.labels.copyUnavailable;
    }
    valueRow.append(copyButton);
    row.append(valueRow);

    window.addEventListener('message', event => {
        if (!isCopyResultMessage(event.data) || event.data.field !== field) {
            return;
        }

        copyButton.textContent = event.data.success ? viewModel.labels.copied : viewModel.labels.copyFailed;
        window.setTimeout(() => {
            copyButton.textContent = viewModel.labels.copy;
        }, 1800);
    });

    return row;
}

function isCopyResultMessage(message: unknown): message is CopyResultMessage {
    return !!message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === 'copyResult' &&
        'field' in message &&
        (message.field === 'baseUrl' || message.field === 'triggerConfigurationName') &&
        'success' in message &&
        typeof message.success === 'boolean';
}

function button(
    label: string,
    className: string,
    onClick: () => void,
    disabled: boolean = false,
): HTMLButtonElement {
    const result = element('button', className);
    result.type = 'button';
    result.textContent = label;
    result.disabled = disabled;
    result.addEventListener('click', onClick);
    return result;
}

function textElement<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    className: string | undefined,
    text: string,
): HTMLElementTagNameMap[K] {
    const result = element(tagName, className);
    result.textContent = text;
    return result;
}

function element<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    className?: string,
): HTMLElementTagNameMap[K] {
    const result = document.createElement(tagName);
    if (className) {
        result.className = className;
    }
    return result;
}
