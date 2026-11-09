/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference lib="dom" />

import { Button, Spinner } from '@fluentui/react-components';
import { useConfiguration, WebviewContext } from '@microsoft/vscode-azext-webview/webview';
import { useContext, useEffect, useRef, useState, type JSX } from 'react';
import { AzureContextFields } from '../AzureContextFields';
import { ConnectorTriggerParameterSection } from './ConnectorTriggerParametersView';
import {
    isConnectorParameterConfiguration,
    isConnectorParameterResponse,
    type ConnectorParameterAction,
    type ConnectorParameterFormState,
    type ConnectorTriggerParametersViewModel,
} from './ConnectorTriggerParametersViewModel';
import {
    applyConnectorSetupAction,
    isConnectorSetupResponse,
    type ConnectorSetupAction,
    type ConnectorSetupNameField,
    type ConnectorSetupResourceState,
    type ConnectorTriggerSetupViewModel,
} from './ConnectorTriggerSetupViewModel';

export function ConnectorTriggerSetupView(): JSX.Element {
    const viewModel = useConfiguration<ConnectorTriggerSetupViewModel>();
    const { vscodeApi } = useContext(WebviewContext);
    const [resources, setResources] = useState<ConnectorSetupResourceState>();
    const [parameterModel, setParameterModel] = useState<ConnectorTriggerParametersViewModel>();
    const [parameters, setParameters] = useState<ConnectorParameterFormState>();
    const resourceRevision = useRef(0);
    const parameterRevision = useRef(0);
    useEffect(() => {
        const listener = (event: MessageEvent<unknown>) => {
            if (isConnectorSetupResponse(event.data) && event.data.state.revision >= resourceRevision.current) {
                resourceRevision.current = event.data.state.revision;
                setResources(event.data.state);
            } else if (isConnectorParameterConfiguration(event.data)) {
                setParameterModel(event.data.viewModel);
                vscodeApi.postMessage({ command: 'initialize' });
            } else if (isConnectorParameterResponse(event.data) && event.data.state.revision >= parameterRevision.current) {
                parameterRevision.current = event.data.state.revision;
                setParameters(event.data.state);
            }
        };
        window.addEventListener('message', listener);
        vscodeApi.postMessage({ command: 'initializeSetup' });
        return () => window.removeEventListener('message', listener);
    }, [vscodeApi]);
    const sendResource = (action: ConnectorSetupAction) => {
        const revision = ++resourceRevision.current;
        setResources(current => current ? applyConnectorSetupAction(current, action, viewModel.labels.provisioning) : current);
        vscodeApi.postMessage({ ...action, revision });
    };
    const sendParameter = (action: ConnectorParameterAction) => {
        const revision = ++parameterRevision.current;
        setParameters(current => current ? {
            ...current,
            canSubmit: false,
            fields: current.fields.map(field =>
                action.command === 'edit' && field.name === action.name ? { ...field, text: action.text } :
                    (action.command === 'browse' || action.command === 'reload') && field.name === action.name ?
                        { ...field, status: 'loading' } : field),
        } : current);
        vscodeApi.postMessage({ ...action, revision });
    };
    return <ConnectorTriggerSetupPage
        viewModel={viewModel}
        resources={resources}
        parameterModel={parameterModel}
        parameters={parameters}
        sendResource={sendResource}
        sendParameter={sendParameter}
        cancel={() => vscodeApi.postMessage({ command: 'cancelParameters' })}
    />;
}

export function ConnectorTriggerSetupPage({
    viewModel,
    resources,
    parameterModel,
    parameters,
    sendResource,
    sendParameter,
    cancel,
}: {
    viewModel: ConnectorTriggerSetupViewModel;
    resources?: ConnectorSetupResourceState;
    parameterModel?: ConnectorTriggerParametersViewModel;
    parameters?: ConnectorParameterFormState;
    sendResource: (action: ConnectorSetupAction) => void;
    sendParameter: (action: ConnectorParameterAction) => void;
    cancel: () => void;
}): JSX.Element {
    const { labels } = viewModel;
    const locked = !!resources && resources.phase !== 'resources';
    const working = locked && resources.phase !== 'parameters';
    const loading = !resources || resources.loading;
    const status = loading ? labels.loading : resources.status;
    const renderName = (field: ConnectorSetupNameField, label: string, isNew: boolean) => (
        <div className="setup-name-field">
            <label htmlFor={`setup-${field}`}>{label}</label>
            <input id={`setup-${field}`} type="text" value={resources?.names[field] ?? ''}
                disabled={!resources?.scopeReady || locked || !isNew} autoComplete="off"
                aria-invalid={!!resources?.errors[field]} aria-describedby={`setup-${field}-error`}
                onChange={event => sendResource({ command: 'editResource', field, text: event.target.value })} />
            <p id={`setup-${field}-error`} className="parameter-error" role={resources?.errors[field] ? 'alert' : undefined}>{resources?.errors[field]}</p>
        </div>
    );
    const context = [
        [labels.connector, viewModel.connector],
        [labels.event, viewModel.event],
        [labels.tenant, resources?.tenant],
        [labels.cloud, resources?.cloud],
    ];
    return (
        <main className="page connector-parameters connector-setup">
            <header className="gallery-header">
                <h1>{labels.title}</h1>
                <p>{labels.subtitle}</p>
                <div className="gallery-tabs"><span className="parameter-tab">{labels.connectorTriggers}</span></div>
            </header>
            <section className="step-page">
                {(working || loading) && <div className="setup-progress" role="status" aria-live="polite">
                    <Spinner size="small" label={status} labelPosition="after" />
                </div>}
                <dl className="parameter-context">
                    {context.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                </dl>
                <h2>{labels.resources}</h2>
                <p className="parameter-notice">{labels.scopeNotice}</p>
                <AzureContextFields
                    labels={labels}
                    subscriptions={resources?.subscriptionOptions ?? []}
                    selectedSubscriptionId={resources?.subscriptionId ?? ''}
                    subscriptionsLoading={loading}
                    showingAllSubscriptions={resources?.showingAllSubscriptions ?? false}
                    signInRequired={!resources?.subscriptionOptions.length}
                    signInLabel={labels.signIn}
                    showSubscriptionIds={false}
                    subscriptionInputId="setup-subscription"
                    locations={resources?.regionOptions.map(option => ({ ...option, name: option.id })) ?? []}
                    selectedRegion={resources?.regionId ?? ''}
                    locationsLoading={loading}
                    regionSelectId="setup-region"
                    disabled={locked}
                    onRequestSignIn={() => sendResource({ command: 'signInSetup' })}
                    onShowAllSubscriptions={() => sendResource({ command: 'loadAllSubscriptions' })}
                    onUseFilteredSubscriptions={() => sendResource({ command: 'loadFilteredSubscriptions' })}
                    onSelectSubscription={id => sendResource({ command: 'selectSubscription', id })}
                    onSelectRegion={id => sendResource({ command: 'selectRegion', id })}
                />
                <div className="setup-resource-grid" aria-busy={working || loading}>
                    <div>
                        <label htmlFor="setup-namespace">{labels.namespace}</label>
                        <select id="setup-namespace" value={resources?.namespaceId ?? 'new'} disabled={!resources?.scopeReady || locked || resources.loading}
                            onChange={event => sendResource({ command: 'selectNamespace', id: event.target.value })}>
                            {resources?.namespaceOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                        </select>
                        {renderName('resourceGroupName', labels.resourceGroup, resources?.namespaceIsNew === true)}
                        {renderName('namespaceName', labels.namespaceName, resources?.namespaceIsNew === true)}
                    </div>
                    <div>
                        <label htmlFor="setup-connection">{labels.connection}</label>
                        <select id="setup-connection" value={resources?.connectionId ?? 'new'} disabled={!resources?.scopeReady || locked || resources.loading}
                            onChange={event => sendResource({ command: 'selectConnection', id: event.target.value })}>
                            {resources?.connectionOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                        </select>
                        {renderName('connectionName', labels.connectionName, resources?.connectionIsNew === true)}
                    </div>
                </div>
                {!working && !loading && <p role="status" aria-live="polite">{status}</p>}
                {locked && <p className="parameter-notice">{labels.resourceChoicesLocked}</p>}
                {resources?.error && <p className="parameter-error" role="alert">{resources.error}</p>}
                {!locked && resources?.error && <button type="button" disabled={resources.loading}
                    onClick={() => sendResource({ command: 'reloadSetup' })}>{labels.retry}</button>}
                <h2>{labels.localSettings}</h2>
                <div className="setup-review-table">
                    <table>
                        <caption className="setup-review-caption">{labels.localSettings}</caption>
                        <thead><tr><th scope="col">{labels.setting}</th><th scope="col">{labels.action}</th><th scope="col">{labels.valueSource}</th></tr></thead>
                        <tbody>{viewModel.localSettings.map(setting => (
                            <tr key={setting.name}>
                                <th scope="row"><code>{setting.name}</code></th>
                                <td>{setting.action}</td>
                                <td>{setting.source}{setting.environmentOverride && <p className="warning-text">{labels.environmentOverride}</p>}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
                <p className="parameter-notice">{labels.notice}</p>
                {(!locked || working) && <div className="parameter-actions">
                    <Button className="parameter-primary" appearance="primary" type="button" disabled={working || !resources?.canApprove}
                        icon={working ? <Spinner size="tiny" aria-hidden="true" /> : undefined}
                        onClick={() => sendResource({ command: 'approveSetup' })}>{working ? labels.working : labels.approve}</Button>
                </div>}
                {parameterModel ? <ConnectorTriggerParameterSection
                    viewModel={parameterModel} state={parameters} send={sendParameter}
                    disabled={resources?.phase !== 'parameters'} /> :
                    <section className="setup-parameters-locked">
                        <h2>{labels.parameters}</h2>
                        <p className="parameter-notice">{labels.parametersLocked}</p>
                    </section>}
                <div className="parameter-actions">
                    <Button type="button" onClick={cancel}>{labels.cancel}</Button>
                </div>
            </section>
        </main>
    );
}
