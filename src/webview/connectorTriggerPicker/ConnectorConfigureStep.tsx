/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Button } from '@fluentui/react-components';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { ConnectorBrandIcon } from './ConnectorBrandIcon';
import {
    type ConnectorDeliveryMode,
    type ConnectorNamespaceOption,
    type ConnectorTriggerInputDefinition,
    type ConnectorTriggerOperationOption,
    type ConnectorTriggerOption,
    type ConnectorTriggerPickerViewModel,
} from './ConnectorTriggerPickerViewModel';

interface ConnectorConfigureStepProps {
    connector: ConnectorTriggerOption;
    deliveryMode: ConnectorDeliveryMode;
    labels: ConnectorTriggerPickerViewModel['labels'];
    language?: string;
    namespace: ConnectorNamespaceOption;
    operation: ConnectorTriggerOperationOption;
    operationInputsError: string;
    operationInputsLoading: boolean;
    projectCreating: boolean;
    projectCreationDetail: string;
    projectCreationError: string;
    onChangeDeliveryMode: (deliveryMode: ConnectorDeliveryMode) => void;
    onChangeEvent: () => void;
    onRetryOperationInputs: () => void;
    onUseTemplate: () => void;
}

export function ConnectorConfigureStep({
    connector,
    deliveryMode,
    labels,
    language,
    namespace,
    operation,
    operationInputsError,
    operationInputsLoading,
    projectCreating,
    projectCreationDetail,
    projectCreationError,
    onChangeDeliveryMode,
    onChangeEvent,
    onRetryOperationInputs,
    onUseTemplate,
}: ConnectorConfigureStepProps): JSX.Element {
    const [previewTab, setPreviewTab] = useState<'function' | 'infrastructure'>('function');
    const [inputValues, setInputValues] = useState<Record<string, string | boolean>>({});
    const support = getDeliverySupport(operation);
    const inputDefinitions = operation.inputDefinitions;
    const functionPreview = useMemo(() => JSON.stringify({
        language: language || 'selected project language',
        connectorNamespace: namespace.name,
        connector: connector.id,
        trigger: operation.id,
        deliveryMode,
    }, null, 2), [connector.id, deliveryMode, language, namespace.name, operation.id]);
    const infrastructurePreview = useMemo(() => JSON.stringify({
        subscription: namespace.subscriptionName,
        resourceGroup: namespace.resourceGroup,
        location: namespace.location,
        connectorNamespace: namespace.name,
    }, null, 2), [namespace]);

    useEffect(() => {
        const initialValues: Record<string, string | boolean> = {};
        for (const input of inputDefinitions ?? []) {
            if (input.defaultValue !== undefined && !input.sensitive) {
                initialValues[input.name] = typeof input.defaultValue === 'boolean' ?
                    input.defaultValue :
                    String(input.defaultValue);
            }
        }
        setInputValues(initialValues);
    }, [inputDefinitions, operation.id]);

    return (
        <section className="step-page configure-page">
            <h2>{labels.configurePageTitle}</h2>
            <p className="step-description">{labels.configurePageDescription}</p>

            <div className="selection-summary configure-summary">
                <ConnectorBrandIcon connector={connector} size={24} />
                <span>
                    <strong>{connector.label}</strong>
                    <b>{operation.label}</b>
                    {operation.description && <small>{operation.description}</small>}
                </span>
                <Button
                    appearance="subtle"
                    icon={<span className="codicon codicon-arrow-swap" aria-hidden="true" />}
                    onClick={onChangeEvent}
                >
                    {labels.changeEvent}
                </Button>
            </div>

            <div className="delivery-field">
                <strong>{labels.deliveryQuestion}</strong>
                <div className="delivery-controls">
                    <Button
                        appearance={deliveryMode === 'Polling' ? 'primary' : 'secondary'}
                        disabled={!support.polling}
                        onClick={() => onChangeDeliveryMode('Polling')}
                    >
                        {labels.polling}
                    </Button>
                    <Button
                        appearance={deliveryMode === 'Webhook' ? 'primary' : 'secondary'}
                        disabled={!support.webhook}
                        title={labels.webhookDescription}
                        onClick={() => onChangeDeliveryMode('Webhook')}
                    >
                        {labels.webhook}
                    </Button>
                    <span>
                        {deliveryMode === 'Polling' ?
                            labels.pollingDescription :
                            labels.webhookDescription}
                    </span>
                </div>
            </div>

            <div className="event-parameters">
                <h3>{labels.eventParameters}</h3>
                <p>{labels.eventParametersDescription}</p>
                {operationInputsLoading ||
                    inputDefinitions === undefined && !operationInputsError ?
                    <p className="status-text">{labels.loadingEventParameters}</p> :
                    operationInputsError ?
                        <div className="load-error" role="alert">
                            <p>{operationInputsError}</p>
                            <Button appearance="secondary" onClick={onRetryOperationInputs}>
                                {labels.retry}
                            </Button>
                        </div> :
                        inputDefinitions?.length === 0 ?
                            <p className="status-text">{labels.noEventParameters}</p> :
                            <div className="event-parameter-grid">
                                {inputDefinitions?.map((input, index) =>
                                    <EventParameterField
                                        key={input.name}
                                        id={`connector-event-parameter-${index}`}
                                        input={input}
                                        labels={labels}
                                        value={inputValues[input.name]}
                                        onChange={value => setInputValues(current => ({
                                            ...current,
                                            [input.name]: value,
                                        }))}
                                    />
                                )}
                            </div>
                }
            </div>

            <div className="preview-panel">
                <div className="preview-callout">
                    <strong>{labels.selectionPreview}</strong>
                    <p>{connector.label} · {operation.label} · {deliveryMode}</p>
                </div>
                <div className="preview-tabs" role="tablist">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={previewTab === 'function'}
                        className={previewTab === 'function' ? 'active' : ''}
                        onClick={() => setPreviewTab('function')}
                    >
                        <span className="codicon codicon-code" aria-hidden="true" />
                        {labels.functionPreview}
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={previewTab === 'infrastructure'}
                        className={previewTab === 'infrastructure' ? 'active' : ''}
                        onClick={() => setPreviewTab('infrastructure')}
                    >
                        <span className="codicon codicon-file-code" aria-hidden="true" />
                        {labels.infrastructurePreview}
                    </button>
                </div>
                <pre>{previewTab === 'function' ? functionPreview : infrastructurePreview}</pre>
                {projectCreationError &&
                    <p className="project-creation-error" role="alert">{projectCreationError}</p>
                }
                <div className="use-template-row">
                    {projectCreating && <span>{projectCreationDetail || labels.creatingProject}</span>}
                    <Button
                        appearance="primary"
                        disabled={projectCreating}
                        onClick={onUseTemplate}
                    >
                        {projectCreating ? labels.creatingProject : labels.useTemplate}
                    </Button>
                </div>
            </div>
        </section>
    );
}

function EventParameterField({
    id,
    input,
    labels,
    value,
    onChange,
}: {
    id: string;
    input: ConnectorTriggerInputDefinition;
    labels: ConnectorTriggerPickerViewModel['labels'];
    value: string | boolean | undefined;
    onChange: (value: string | boolean) => void;
}): JSX.Element {
    const label = (
        <span>
            {input.label}
            {input.required && <small> ({labels.requiredParameter})</small>}
        </span>
    );
    let control: JSX.Element;
    if (input.type === 'boolean') {
        control = (
            <label className="boolean-parameter" htmlFor={id}>
                <input
                    id={id}
                    type="checkbox"
                    required={input.required}
                    checked={value === true}
                    onChange={event => onChange(event.target.checked)}
                />
                {label}
            </label>
        );
    } else if (input.options?.length) {
        control = (
            <>
                <label htmlFor={id}>{label}</label>
                <select
                    id={id}
                    required={input.required}
                    value={typeof value === 'string' ? value : ''}
                    onChange={event => onChange(event.target.value)}
                >
                    <option value="" />
                    {input.options.map(option =>
                        <option key={option.value} value={option.value}>{option.label}</option>
                    )}
                </select>
            </>
        );
    } else if (input.type === 'array' || input.type === 'object') {
        control = (
            <>
                <label htmlFor={id}>{label}</label>
                <textarea
                    id={id}
                    required={input.required}
                    value={typeof value === 'string' ? value : ''}
                    onChange={event => onChange(event.target.value)}
                />
            </>
        );
    } else {
        control = (
            <>
                <label htmlFor={id}>{label}</label>
                <input
                    id={id}
                    type={input.sensitive ?
                        'password' :
                        input.type === 'integer' || input.type === 'number' ?
                            'number' :
                            'text'}
                    required={input.required}
                    value={typeof value === 'string' ? value : ''}
                    onChange={event => onChange(event.target.value)}
                />
            </>
        );
    }

    return (
        <div className="event-parameter">
            {control}
            {input.description && <small>{input.description}</small>}
            {input.dynamic && <small>{labels.dynamicParameterDescription}</small>}
        </div>
    );
}

export function getDeliverySupport(
    operation: Pick<ConnectorTriggerOperationOption, 'isNotification' | 'isWebhook'>,
): { polling: boolean; webhook: boolean } {
    return {
        polling: !operation.isWebhook,
        webhook: false,
    };
}
