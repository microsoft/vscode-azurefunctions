/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Button } from '@fluentui/react-components';
import { useMemo, useState, type JSX } from 'react';
import { ConnectorBrandIcon } from './ConnectorBrandIcon';
import {
    type ConnectorDeliveryMode,
    type ConnectorNamespaceOption,
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
    projectCreating: boolean;
    projectCreationDetail: string;
    projectCreationError: string;
    onChangeDeliveryMode: (deliveryMode: ConnectorDeliveryMode) => void;
    onChangeEvent: () => void;
    onUseTemplate: () => void;
}

export function ConnectorConfigureStep({
    connector,
    deliveryMode,
    labels,
    language,
    namespace,
    operation,
    projectCreating,
    projectCreationDetail,
    projectCreationError,
    onChangeDeliveryMode,
    onChangeEvent,
    onUseTemplate,
}: ConnectorConfigureStepProps): JSX.Element {
    const [previewTab, setPreviewTab] = useState<'function' | 'infrastructure'>('function');
    const support = getDeliverySupport(operation);
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

export function getDeliverySupport(
    operation: Pick<ConnectorTriggerOperationOption, 'isNotification' | 'isWebhook'>,
): { polling: boolean; webhook: boolean } {
    const polling = !operation.isWebhook && !operation.isNotification;
    return {
        polling,
        webhook: false,
    };
}
