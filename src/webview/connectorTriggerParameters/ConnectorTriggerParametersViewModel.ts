/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ConnectorParameterOption {
    id: string;
    label: string;
    hasChildren: boolean;
    selectable: boolean;
}

export interface ConnectorParameterField {
    name: string;
    label: string;
    description?: string;
    required: boolean;
    advanced: boolean;
    sensitive: boolean;
    multiline: boolean;
    multiple: boolean;
    dynamic: boolean;
    kind: 'text' | 'choices' | 'tree';
    text: string;
    selected: string[];
    selectedLabels: string[];
    options: ConnectorParameterOption[];
    parent?: ConnectorParameterOption;
    canGoBack: boolean;
    status: 'idle' | 'loading' | 'ready' | 'error';
    error?: string;
    dependencyLabels: string[];
}

export interface ConnectorParameterFormState {
    revision: number;
    fields: ConnectorParameterField[];
    canSubmit: boolean;
    error?: string;
}

export interface ConnectorTriggerParametersViewModel {
    connector: string;
    event: string;
    labels: {
        parameters: string;
        connected: string;
        required: string;
        optional: string;
        advanced: string;
        loading: string;
        empty: string;
        dependencies: string;
        selectValue: string;
        selected: string;
        browse: string;
        back: string;
        selectFolder: string;
        clear: string;
        retry: string;
        apply: string;
        runtimeNotice: string;
    };
}

export type ConnectorParameterAction =
    | { command: 'edit'; name: string; text: string }
    | { command: 'select'; name: string; optionIds: string[] }
    | { command: 'browse'; name: string; optionId: string }
    | { command: 'back' | 'reload'; name: string }
    | { command: 'submit' };

export type ConnectorParameterMessage =
    | { command: 'initialize' }
    | { command: 'cancelParameters' }
    | (ConnectorParameterAction & { revision: number });

export function isConnectorParameterResponse(value: unknown): value is { command: 'parameterState'; state: ConnectorParameterFormState } {
    return !!value && typeof value === 'object' && 'command' in value && value.command === 'parameterState' &&
        'state' in value && !!value.state && typeof value.state === 'object' &&
        'revision' in value.state && Number.isSafeInteger(value.state.revision) &&
        'fields' in value.state && Array.isArray(value.state.fields) &&
        'canSubmit' in value.state && typeof value.state.canSubmit === 'boolean';
}

export function isConnectorParameterConfiguration(value: unknown): value is { command: 'parameterConfiguration'; viewModel: ConnectorTriggerParametersViewModel } {
    return !!value && typeof value === 'object' && 'command' in value && value.command === 'parameterConfiguration' &&
        'viewModel' in value && !!value.viewModel && typeof value.viewModel === 'object' &&
        'connector' in value.viewModel && typeof value.viewModel.connector === 'string' &&
        'event' in value.viewModel && typeof value.viewModel.event === 'string' &&
        'labels' in value.viewModel && !!value.viewModel.labels && typeof value.viewModel.labels === 'object';
}

export function isConnectorParameterMessage(value: unknown): value is ConnectorParameterMessage {
    if (!value || typeof value !== 'object' || !('command' in value)) {
        return false;
    }
    if (value.command === 'initialize' || value.command === 'cancelParameters') {
        return true;
    }
    if (!('revision' in value) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1) {
        return false;
    }
    if (value.command === 'submit') {
        return true;
    }
    if (!('name' in value) || typeof value.name !== 'string') {
        return false;
    }
    switch (value.command) {
        case 'edit':
            return 'text' in value && typeof value.text === 'string';
        case 'select':
            return 'optionIds' in value && Array.isArray(value.optionIds) &&
                value.optionIds.every(id => typeof id === 'string');
        case 'browse':
            return 'optionId' in value && typeof value.optionId === 'string';
        case 'back':
        case 'reload':
            return true;
        default:
            return false;
    }
}
