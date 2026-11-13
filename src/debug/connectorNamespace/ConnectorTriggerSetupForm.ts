/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { resourceGroupNamingRules } from '@microsoft/vscode-azext-azureutils';
import { isUserCancelledError, validationUtils, type IActionContext } from '@microsoft/vscode-azext-utils';
import { validateConnectorNamespaceName } from '../../commands/createFunction/connectorSteps/ConnectorNamespaceNameStep';
import { localize } from '../../localize';
import {
    isConnectorSetupMessage,
    type ConnectorSetupResourceState,
    type ConnectorTriggerSetupViewModel,
} from '../../webview/connectorTriggerParameters/ConnectorTriggerSetupViewModel';
import {
    type ConnectorTriggerConnection,
    type ConnectorTriggerGateway,
    type ConnectorTriggerNamespace,
    type ConnectorTriggerSetupPlan,
    type ConnectorTriggerSetupRequest,
    type ConnectorTriggerSetupStatus,
    type ConnectorTriggerSetupScopes,
    type ConnectorTriggerSetupScope,
    type ConnectorTriggerSetupSubscriptionOption,
    type ConnectorTriggerSetupTarget,
    type ConnectorTriggerResourceNames,
} from './connectorTriggerF5Contracts';
import { createConnectorTriggerResourceNames } from './connectorTriggerF5Setup';

export class ConnectorTriggerSetupForm {
    private readonly subscriptionOptions = new Map<string, ConnectorTriggerSetupSubscriptionOption>();
    private readonly regionOptions = new Map<string, { id: string; label: string; regionCategory?: string }>();
    private readonly connectorOptions = new Map<string, { id: string; label: string }>();
    private readonly eventOptions = new Map<string, { id: string; label: string }>();
    private subscriptionId = '';
    private regionId = '';
    private connectorId = '';
    private eventId = '';
    private subscription?: ConnectorTriggerSetupTarget['subscription'];
    private subscriptionsLoaded = false;
    private showingAllSubscriptions = false;
    private defaults?: ConnectorTriggerResourceNames;
    private namespaces: ConnectorTriggerNamespace[] = [];
    private connections: ConnectorTriggerConnection[] = [];
    private readonly namespaceOptions = new Map<string, ConnectorTriggerNamespace>();
    private readonly connectionOptions = new Map<string, ConnectorTriggerConnection>();
    private namespaceId = 'new';
    private connectionId = 'new';
    private readonly names: ConnectorSetupResourceState['names'] = {
        resourceGroupName: '', namespaceName: '', connectionName: '',
    };
    private revision = 0;
    private generation = 0;
    private nextOptionId = 0;
    private initialized = false;
    private loading = false;
    private disposed = false;
    private phase: ConnectorSetupResourceState['phase'] = 'resources';
    private error: string | undefined;
    private loadError: string | undefined;

    public constructor(
        private readonly context: IActionContext,
        private readonly request: ConnectorTriggerSetupRequest,
        private readonly gateway: Pick<ConnectorTriggerGateway, 'listNamespaces' | 'listConnections'>,
        private readonly scopes: ConnectorTriggerSetupScopes,
        private readonly onChange: (state: ConnectorSetupResourceState) => void,
    ) { }

    public get state(): ConnectorSetupResourceState {
        const plan = this.plan;
        const namespace = this.namespaceOptions.get(this.namespaceId);
        const connection = this.connectionOptions.get(this.connectionId);
        const errors = this.validate();
        return {
            revision: this.revision,
            phase: this.phase,
            status: setupStatus(this.phase),
            loading: this.loading,
            showingAllSubscriptions: this.showingAllSubscriptions,
            subscriptionOptions: this.subscriptionLabels(),
            subscriptionId: this.subscriptionId,
            regionOptions: [...this.regionOptions].map(([id, option]) => ({ id, label: option.label, regionCategory: option.regionCategory })),
            regionId: this.regionId,
            connectorOptions: [...this.connectorOptions].map(([id, option]) => ({ id, label: option.label })),
            connectorId: this.connectorId,
            eventOptions: [...this.eventOptions].map(([id, option]) => ({ id, label: option.label })),
            eventId: this.eventId,
            regionReady: !!this.scope,
            scopeReady: !!this.target,
            tenant: this.subscription?.tenantId,
            cloud: this.subscription?.environment.name,
            namespaceOptions: [
                { id: 'new', label: localize('connectorSetupNewNamespace', 'Create a new Connector Namespace') },
                ...[...this.namespaceOptions].map(([id, resource]) => ({ id, label: `${resource.name} (${resource.resourceGroupName})` })),
            ],
            namespaceId: this.namespaceId,
            namespaceIsNew: !namespace,
            connectionOptions: [
                { id: 'new', label: localize('connectorSetupNewConnection', 'Create a new connector connection') },
                ...[...this.connectionOptions].map(([id, resource]) => ({ id, label: resource.name })),
            ],
            connectionId: this.connectionId,
            connectionIsNew: !connection,
            names: {
                resourceGroupName: namespace?.resourceGroupName ?? this.names.resourceGroupName,
                namespaceName: namespace?.name ?? this.names.namespaceName,
                connectionName: connection?.name ?? this.names.connectionName,
            },
            errors,
            canApprove: !!plan && this.phase === 'resources' && this.initialized && !this.loading &&
                !this.error && !this.loadError && Object.keys(errors).length === 0,
            error: this.error ?? this.loadError,
        };
    }

    public setStatus(status: ConnectorTriggerSetupStatus): void {
        if (!this.disposed) {
            this.phase = status;
            this.notify();
        }
    }

    public dispose(): void {
        this.disposed = true;
        this.generation += 1;
        this.namespaceOptions.clear();
        this.connectionOptions.clear();
        this.subscriptionOptions.clear();
        this.regionOptions.clear();
        this.connectorOptions.clear();
        this.eventOptions.clear();
        this.subscription = undefined;
    }

    public async handleMessage(message: unknown): Promise<ConnectorTriggerSetupPlan | undefined> {
        if (this.disposed) {
            return undefined;
        }
        if (!isConnectorSetupMessage(message)) {
            this.error = localize('invalidConnectorSetupMessage', 'The resource request is invalid. Close this form and retry F5.');
            this.notify();
            return undefined;
        }
        if (message.command === 'initializeSetup') {
            if (this.subscriptionsLoaded || this.loading || this.phase !== 'resources') {
                this.notify();
            } else {
                await this.loadSubscriptions();
            }
            return undefined;
        }
        if (message.revision <= this.revision) {
            this.notify();
            return undefined;
        }
        this.revision = message.revision;
        if (this.phase !== 'resources') {
            this.error = localize('connectorSetupResourcesLocked', 'Resource choices are locked because setup has started. Cancel and restart debugging to change them.');
            this.notify();
            return undefined;
        }
        this.error = undefined;
        switch (message.command) {
            case 'loadAllSubscriptions':
            case 'loadFilteredSubscriptions':
                await this.loadSubscriptions(message.command === 'loadAllSubscriptions');
                return undefined;
            case 'reloadSetup':
                if (this.target) {
                    await this.loadNamespaces();
                } else if (this.scope) {
                    if (this.connectorOptions.has(this.connectorId)) {
                        await this.loadEvents();
                    } else {
                        await this.loadConnectors();
                    }
                } else if (this.subscriptionOptions.has(this.subscriptionId)) {
                    await this.loadSubscription();
                } else {
                    await this.loadSubscriptions();
                }
                return undefined;
            case 'signInSetup':
                await this.signIn();
                return undefined;
            case 'selectSubscription':
                if (!this.subscriptionOptions.has(message.id)) {
                    this.error = invalidResourceSelection();
                    break;
                }
                this.subscriptionId = message.id;
                await this.loadSubscription();
                return undefined;
            case 'selectRegion':
                if (!this.regionOptions.has(message.id) || !this.subscription) {
                    this.error = invalidResourceSelection();
                    break;
                }
                this.regionId = message.id;
                this.resetIdentity();
                this.resetResources();
                await this.loadIdentity();
                return undefined;
            case 'selectConnector':
                if (this.request.metadata || !this.connectorOptions.has(message.id)) {
                    this.error = invalidResourceSelection();
                    break;
                }
                this.connectorId = message.id;
                await this.loadEvents();
                return undefined;
            case 'selectEvent':
                if (this.request.metadata || !this.eventOptions.has(message.id)) {
                    this.error = invalidResourceSelection();
                    break;
                }
                this.eventId = message.id;
                this.resetResources();
                await this.loadNamespaces();
                return undefined;
            case 'selectNamespace':
                if (!this.initialized || message.id !== 'new' && !this.namespaceOptions.has(message.id)) {
                    this.error = invalidResourceSelection();
                    break;
                }
                this.namespaceId = message.id;
                await this.loadConnections();
                return undefined;
            case 'selectConnection':
                if (this.loading || message.id !== 'new' && !this.connectionOptions.has(message.id)) {
                    this.error = invalidResourceSelection();
                    break;
                }
                this.connectionId = message.id;
                break;
            case 'editResource':
                if (message.field === 'connectionName' ? this.connectionId !== 'new' : this.namespaceId !== 'new') {
                    this.error = invalidResourceSelection();
                    break;
                }
                this.names[message.field] = message.text;
                maskValue(this.context, message.text);
                break;
            case 'approveSetup':
                if (this.state.canApprove && this.plan) {
                    const plan = this.plan;
                    this.phase = 'provisioning';
                    this.generation += 1;
                    this.notify();
                    return plan;
                }
                this.error = localize('connectorSetupReviewRequired', 'Choose valid resources and resolve loading errors before starting setup.');
                break;
        }
        this.notify();
        return undefined;
    }

    private subscriptionLabels(): { id: string; label: string }[] {
        const nameKey = (option: ConnectorTriggerSetupSubscriptionOption) => option.label.trim().toLowerCase();
        const idKey = (option: ConnectorTriggerSetupSubscriptionOption) => `${nameKey(option)}\n${option.id.toLowerCase()}`;
        const count = (keys: Map<string, number>, key: string) => keys.set(key, (keys.get(key) ?? 0) + 1);
        const names = new Map<string, number>();
        const ids = new Map<string, number>();
        for (const option of this.subscriptionOptions.values()) {
            count(names, nameKey(option));
            count(ids, idKey(option));
        }
        return [...this.subscriptionOptions].map(([id, option]) => {
            let label = option.label;
            if ((ids.get(idKey(option)) ?? 0) > 1 && option.accountLabel) {
                // The same subscription is listed under several accounts; only the account tells them apart.
                label = localize('connectorSetupSubscriptionWithAccount', '{0} ({1}, {2})', option.label, option.id, option.accountLabel);
            } else if ((names.get(nameKey(option)) ?? 0) > 1) {
                label = localize('connectorSetupSubscriptionWithId', '{0} ({1})', option.label, option.id);
            }
            return { id, label };
        });
    }

    private get scope(): ConnectorTriggerSetupScope | undefined {
        const region = this.regionOptions.get(this.regionId);
        return this.subscription && region ? { subscription: this.subscription, region: region.id } : undefined;
    }

    private get target(): ConnectorTriggerSetupTarget | undefined {
        const scope = this.scope;
        const connector = this.connectorOptions.get(this.connectorId);
        const event = this.eventOptions.get(this.eventId);
        const metadata = this.request.metadata ?? (connector && event ? {
            version: 1 as const, connectorId: connector.id, operationId: event.id,
        } : undefined);
        return scope && metadata ? { ...metadata, ...scope } : undefined;
    }

    private get plan(): ConnectorTriggerSetupPlan | undefined {
        const target = this.target;
        if (!target || !this.defaults) {
            return undefined;
        }
        const namespace = this.namespaceOptions.get(this.namespaceId);
        const connection = this.connectionOptions.get(this.connectionId);
        return {
            target,
            namespace: namespace ? { kind: 'existing', namespace } : {
                kind: 'create',
                resourceGroupName: this.names.resourceGroupName.trim(),
                namespaceName: this.names.namespaceName.trim(),
            },
            connection: connection ? { kind: 'existing', connection } : {
                kind: 'create',
                connectionName: this.names.connectionName.trim(),
            },
            triggerConfigName: this.defaults.triggerConfigName,
            localSettings: this.request.localSettings,
        };
    }

    private validate(): ConnectorSetupResourceState['errors'] {
        const errors: ConnectorSetupResourceState['errors'] = {};
        if (!this.target || !this.defaults) {
            return errors;
        }
        if (this.namespaceId === 'new') {
            const group = this.names.resourceGroupName.trim();
            const name = this.names.namespaceName.trim();
            const groupRules = resourceGroupNamingRules;
            if (group.length < groupRules.minLength || group.length > groupRules.maxLength) {
                errors.resourceGroupName = validationUtils.getInvalidCharLengthMessage({
                    lowerLimitIncl: groupRules.minLength, upperLimitIncl: groupRules.maxLength,
                });
            } else if (group.match(groupRules.invalidCharsRegExp) || group.endsWith('.')) {
                errors.resourceGroupName = localize('connectorSetupInvalidResourceGroup', 'Use letters, numbers, periods, underscores, hyphens or parentheses. The resource group name cannot end in a period.');
            }
            const nameError = validateConnectorNamespaceName(name);
            if (nameError) {
                errors.namespaceName = nameError;
            } else if (this.namespaces.some(resource => equals(resource.name, name) && equals(resource.resourceGroupName, group))) {
                errors.namespaceName = localize('connectorSetupNamespaceExists', 'A namespace with this name already exists in this resource group. Select an existing namespace in the selected region or use a different name.');
            }
        }
        if (this.connectionId === 'new') {
            const name = this.names.connectionName.trim();
            if (validateConnectorNamespaceName(name)) {
                errors.connectionName = localize('connectorSetupInvalidConnectionName', 'Use 2 to 64 alphanumeric characters, hyphens or underscores, starting with an alphanumeric character.');
            } else if (this.connections.some(resource => equals(resource.name, name))) {
                errors.connectionName = localize('connectorSetupConnectionExists', 'A connection with this name already exists. Select an existing connection for this connector or use a different name.');
            }
        }
        return errors;
    }

    private resetResources(): void {
        this.initialized = false;
        this.namespaceId = 'new';
        this.connectionId = 'new';
        this.namespaces = [];
        this.connections = [];
        this.namespaceOptions.clear();
        this.connectionOptions.clear();
    }

    private resetIdentity(): void {
        this.connectorId = '';
        this.eventId = '';
        this.connectorOptions.clear();
        this.eventOptions.clear();
    }

    private async loadIdentity(): Promise<void> {
        if (this.request.metadata) {
            await this.loadNamespaces();
        } else {
            await this.loadConnectors();
        }
    }

    private async loadConnectors(): Promise<void> {
        const scope = this.scope;
        if (!scope) {
            return;
        }
        const generation = ++this.generation;
        this.resetIdentity();
        this.resetResources();
        this.loading = true;
        this.loadError = undefined;
        this.notify();
        try {
            const connectors = await this.scopes.listConnectors(this.context, scope);
            if (this.disposed || generation !== this.generation) {
                return;
            }
            for (const connector of connectors) {
                maskValue(this.context, connector.id);
                maskValue(this.context, connector.label);
                this.connectorOptions.set(`connector-${++this.nextOptionId}`, connector);
            }
            this.loading = false;
            if (connectors.length === 0) {
                this.loadError = localize('connectorSetupNoConnectors', 'No connectors are available in this region. Choose another region or reload.');
            }
            this.notify();
        } catch (error) {
            this.handleLoadError(error, generation);
        }
    }

    private async loadEvents(): Promise<void> {
        const scope = this.scope;
        const connector = this.connectorOptions.get(this.connectorId);
        if (!scope || !connector) {
            return;
        }
        const generation = ++this.generation;
        this.eventId = '';
        this.eventOptions.clear();
        this.resetResources();
        this.loading = true;
        this.loadError = undefined;
        this.notify();
        try {
            const events = await this.scopes.listEvents(this.context, scope, connector.id);
            if (this.disposed || generation !== this.generation) {
                return;
            }
            for (const event of events) {
                maskValue(this.context, event.id);
                maskValue(this.context, event.label);
                this.eventOptions.set(`event-${++this.nextOptionId}`, event);
            }
            this.loading = false;
            if (events.length === 0) {
                this.loadError = localize('connectorSetupNoEvents', 'This connector has no supported polling events in this region. Choose another connector or reload.');
            }
            this.notify();
        } catch (error) {
            this.handleLoadError(error, generation);
        }
    }

    private async loadSubscriptions(showAll = this.showingAllSubscriptions): Promise<void> {
        const previous = this.subscriptionOptions.get(this.subscriptionId);
        const previousRegion = this.regionOptions.get(this.regionId)?.id;
        const generation = ++this.generation;
        this.subscription = undefined;
        this.regionId = '';
        this.regionOptions.clear();
        this.resetIdentity();
        this.resetResources();
        this.loading = true;
        this.error = undefined;
        this.loadError = undefined;
        this.notify();
        try {
            const subscriptions = await this.scopes.listSubscriptions(this.context, showAll);
            if (this.disposed || generation !== this.generation) {
                return;
            }
            this.subscriptionOptions.clear();
            this.showingAllSubscriptions = showAll;
            for (const option of subscriptions) {
                maskValue(this.context, option.id);
                maskValue(this.context, option.label);
                maskValue(this.context, option.accountId);
                maskValue(this.context, option.accountLabel);
                this.subscriptionOptions.set(`subscription-${++this.nextOptionId}`, option);
            }
            this.subscriptionId = [...this.subscriptionOptions].find(([, option]) =>
                option.id === previous?.id && option.accountId === previous.accountId)?.[0] ?? '';
            this.subscriptionsLoaded = true;
            this.loading = false;
        } catch (error) {
            this.handleLoadError(error, generation);
            return;
        }
        // Chained loads own their generation and errors, so keep them outside this catch to propagate cancellation.
        if (this.subscriptionId) {
            await this.loadSubscription(previousRegion);
        } else {
            this.notify();
        }
    }

    private async loadSubscription(previousRegion?: string): Promise<void> {
        const option = this.subscriptionOptions.get(this.subscriptionId);
        if (!option) {
            this.error = invalidResourceSelection();
            this.notify();
            return;
        }
        const generation = ++this.generation;
        this.subscription = undefined;
        this.regionId = '';
        this.regionOptions.clear();
        this.resetIdentity();
        this.resetResources();
        this.loading = true;
        this.error = undefined;
        this.loadError = undefined;
        this.notify();
        try {
            const [subscription, regions] = await Promise.all([
                this.scopes.getSubscription(this.context, option),
                this.scopes.listRegions(this.context, option),
            ]);
            if (this.disposed || generation !== this.generation) {
                return;
            }
            if (subscription.id !== option.id || subscription.accountId !== option.accountId) {
                throw new Error(invalidResourceSelection());
            }
            this.subscription = subscription;
            for (const value of [
                subscription.id, subscription.tenantId, subscription.accountId,
                subscription.environment.name, subscription.environment.resourceManagerEndpointUrl,
            ]) {
                maskValue(this.context, value);
            }
            for (const region of regions) {
                maskValue(this.context, region.id);
                maskValue(this.context, region.label);
                this.regionOptions.set(`region-${++this.nextOptionId}`, region);
            }
            this.regionId = [...this.regionOptions].find(([, region]) => region.id === previousRegion)?.[0] ?? '';
            this.loading = false;
        } catch (error) {
            this.handleLoadError(error, generation);
            return;
        }
        if (this.regionId) {
            await this.loadIdentity();
        } else {
            this.notify();
        }
    }

    private async signIn(): Promise<void> {
        const generation = ++this.generation;
        this.loading = true;
        this.error = undefined;
        this.loadError = undefined;
        this.notify();
        try {
            await this.scopes.signIn(this.context);
        } catch (error) {
            this.handleLoadError(error, generation);
            return;
        }
        if (!this.disposed && generation === this.generation) {
            await this.loadSubscriptions();
        }
    }

    private async loadNamespaces(): Promise<void> {
        const target = this.target;
        if (!target) {
            this.error = invalidResourceSelection();
            this.notify();
            return;
        }
        const defaults = createConnectorTriggerResourceNames(
            this.request.projectPath, target, this.request.binding, this.request.workspaceId);
        for (const field of ['resourceGroupName', 'namespaceName', 'connectionName'] as const) {
            if (!this.names[field] || this.names[field] === this.defaults?.[field]) {
                this.names[field] = defaults[field];
            }
            maskValue(this.context, this.names[field]);
        }
        this.defaults = defaults;
        const generation = ++this.generation;
        const previous = this.namespaceOptions.get(this.namespaceId);
        this.loading = true;
        this.initialized = false;
        this.error = undefined;
        this.loadError = undefined;
        this.notify();
        try {
            const namespaces = await this.gateway.listNamespaces(this.context, target);
            if (this.disposed || generation !== this.generation) {
                return;
            }
            this.namespaces = namespaces;
            this.namespaceOptions.clear();
            for (const resource of namespaces) {
                if (resource.location.replace(/\s+/g, '').toLowerCase() === target.region.replace(/\s+/g, '').toLowerCase()) {
                    this.namespaceOptions.set(`namespace-${++this.nextOptionId}`, resource);
                }
            }
            const preferred = [...this.namespaceOptions].find(([, resource]) => previous && equals(resource.id, previous.id)) ??
                [...this.namespaceOptions].find(([, resource]) =>
                    equals(resource.name, defaults.namespaceName) &&
                    equals(resource.resourceGroupName, defaults.resourceGroupName));
            this.namespaceId = preferred?.[0] ?? 'new';
            this.initialized = true;
        } catch (error) {
            this.handleLoadError(error, generation);
            return;
        }
        await this.loadConnections();
    }

    private async loadConnections(): Promise<void> {
        const generation = ++this.generation;
        const namespace = this.namespaceOptions.get(this.namespaceId);
        const target = this.target;
        this.connectionId = 'new';
        this.connections = [];
        this.connectionOptions.clear();
        this.loadError = undefined;
        this.loading = !!namespace;
        this.notify();
        if (!namespace || !target) {
            this.loading = false;
            this.notify();
            return;
        }
        try {
            const connections = await this.gateway.listConnections(this.context, target, namespace);
            if (this.disposed || generation !== this.generation) {
                return;
            }
            this.connections = connections;
            for (const resource of connections) {
                if (equals(resource.connectorId, target.connectorId)) {
                    this.connectionOptions.set(`connection-${++this.nextOptionId}`, resource);
                }
            }
            this.connectionId = [...this.connectionOptions].find(([, resource]) =>
                equals(resource.name, this.defaults?.connectionName ?? ''))?.[0] ?? 'new';
            this.loading = false;
            this.notify();
        } catch (error) {
            this.handleLoadError(error, generation);
        }
    }

    private handleLoadError(error: unknown, generation: number): void {
        if (this.disposed || generation !== this.generation) {
            return;
        }
        if (isUserCancelledError(error)) {
            throw error;
        }
        this.loading = false;
        this.loadError = localize('connectorSetupResourceLoadFailed', 'Azure subscriptions, regions, connector events or resources could not be loaded. Check your Azure access and connection, then reload.');
        this.context.telemetry.properties.connectorF5ResourceLoadResult = 'failed';
        this.notify();
    }

    private notify(): void {
        if (!this.disposed) {
            this.onChange(this.state);
        }
    }
}

function equals(left: string, right: string): boolean {
    return left.toLowerCase() === right.toLowerCase();
}

function maskValue(context: IActionContext, value: string | undefined): void {
    if (value && !context.valuesToMask.includes(value)) {
        context.valuesToMask.push(value);
    }
}

function invalidResourceSelection(): string {
    return localize('connectorSetupInvalidSelection', 'Select a resource from the current list or choose to create a new one.');
}

function setupStatus(phase: ConnectorSetupResourceState['phase']): string {
    switch (phase) {
        case 'resources': return localize('connectorSetupChooseResources', 'Choose a subscription, region and resources, then set up and authenticate.');
        case 'provisioning': return localize('connectorSetupProvisioning', 'Setting up the namespace and connector connection...');
        case 'authenticating': return localize('connectorSetupAuthenticating', 'Authenticating and authorizing the connector connection...');
        case 'loadingParameters': return localize('connectorSetupLoadingParameters', 'Loading event parameters from the connector...');
        case 'parameters': return localize('connectorSetupAuthenticated', 'Authenticated. Configure the event parameters below.');
        case 'saving': return localize('connectorSetupSaving', 'Saving Trigger Config and local settings...');
    }
}

export function createConnectorTriggerSetupViewModel(request: ConnectorTriggerSetupRequest): ConnectorTriggerSetupViewModel {
    return {
        connector: request.metadata?.connectorId ?? '',
        event: request.metadata?.operationId ?? '',
        identityRequired: !request.metadata,
        localSettings: request.localSettings.map(setting => ({
            name: setting.name,
            action: setting.exists ? localize('connectorSetupSetExisting', 'Set existing key') : localize('connectorSetupAddSetting', 'Add key'),
            source: setting.purpose === 'pollingEndpoint' ?
                localize('connectorSetupEndpointSource', 'Polling endpoint derived from the service-returned Trigger Config receive URI. Not available until setup completes.') :
                setting.purpose === 'credential' ?
                    localize('connectorSetupVscodeCredentialSource', 'VisualStudioCodeCredential for every default Azure credential chain in this local host process. Not uploaded to Azure.') :
                    setting.purpose === 'tenant' ?
                        localize('connectorSetupVscodeTenantSource', 'The selected subscription tenant for this Connector connection, including when the developer is a guest in that tenant. Not uploaded to Azure.') :
                        localize('connectorSetupConfigSource', 'The name returned by the configured Trigger Config.'),
            environmentOverride: setting.environmentOverride,
        })),
        labels: {
            title: localize('connectorSetupTitle', 'Configure Connector Trigger'),
            subtitle: localize('connectorSetupSubtitle', 'Choose Azure resources, authenticate, and configure event inputs in this screen.'),
            connectorTriggers: localize('connectorTriggers', 'Connector Triggers'),
            connector: localize('connectorSetupConnector', 'Connector'),
            event: localize('connectorSetupEvent', 'Event'),
            subscription: localize('connectorSetupSubscription', 'Subscription'),
            tenant: localize('connectorSetupTenant', 'Tenant'),
            cloud: localize('connectorSetupCloud', 'Azure cloud'),
            region: localize('connectorSetupRegion', 'Region'),
            resources: localize('connectorSetupResources', 'Azure resources'),
            action: localize('connectorSetupAction', 'Action'),
            localSettings: localize('connectorSetupLocalSettings', 'Computed local settings'),
            setting: localize('connectorSetupSetting', 'Setting key'),
            valueSource: localize('connectorSetupValueSource', 'Value source'),
            environmentOverride: localize('connectorSetupEnvironmentOverride', 'An environment variable overrides this key. Setup does not change environment variables.'),
            notice: localize('connectorSetupNotice', 'Set up and authenticate creates or reuses the chosen resources and authorizes the namespace runtime and connection developer identities. Your browser may open for sign-in. Trigger Config and local settings are saved only after you apply event parameters (or after setup for an event with no parameters). Existing setting values are hidden, unrelated settings and source are preserved. Cancelling later keeps any Azure resources already created.'),
            approve: localize('connectorSetupApprove', 'Set up and authenticate'),
            cancel: localize('connectorSetupCancel', 'Cancel setup'),
            namespace: localize('connectorSetupNamespace', 'Connector Namespace'),
            namespaceName: localize('connectorSetupNamespaceName', 'Namespace name'),
            resourceGroup: localize('connectorSetupResourceGroup', 'Resource group (create if missing)'),
            connection: localize('connectorSetupConnection', 'Connector connection'),
            connectionName: localize('connectorSetupConnectionName', 'Connection name'),
            parameters: localize('connectorSetupParameters', 'Event parameters'),
            parametersLocked: localize('connectorSetupParametersLocked', 'Set up and authenticate the connection above to load this event\'s inputs and account-specific choices here.'),
            resourceChoicesLocked: localize('connectorSetupResourceChoicesLocked', 'Resource choices are locked because setup has started. Cancel and restart debugging to change them.'),
            loading: localize('connectorSetupLoading', 'Loading Azure resources...'),
            working: localize('connectorSetupWorking', 'Working...'),
            provisioning: setupStatus('provisioning'),
            loadingSubscriptions: localize('connectorSetupLoadingSubscriptions', 'Loading subscriptions...'),
            loadingRegions: localize('connectorSetupLoadingRegions', 'Loading regions...'),
            recommendedRegions: localize('connectorSetupRecommendedRegions', 'Recommended'),
            otherRegions: localize('connectorSetupOtherRegions', 'Other'),
            retry: localize('connectorSetupReload', 'Reload Azure resources'),
            selectSubscription: localize('connectorSetupSelectSubscription', 'Select a subscription'),
            showAllSubscriptions: localize('connectorTriggerShowAllSubscriptions', 'Show all subscriptions'),
            useFilteredSubscriptions: localize('connectorTriggerUseFilteredSubscriptions', 'Use filtered subscriptions'),
            selectRegion: localize('connectorSetupSelectRegion', 'Select a region'),
            signIn: localize('connectorSetupSignIn', 'Sign in to Azure'),
            scopeNotice: localize('connectorSetupScopeNotice', 'Choose where to provision or reuse resources. This subscription and region are used only for this setup and are not saved to the project setting.'),
            identityNotice: localize('connectorSetupIdentityNotice', 'One polling binding was detected without a saved connector/event association. After choosing a subscription and region, explicitly select the connector and polling event authored in this function. Registration names are not used to guess the event. This selection is used only for this setup.'),
            selectConnector: localize('connectorSetupSelectConnector', 'Select the authored connector'),
            selectEvent: localize('connectorSetupSelectEvent', 'Select the authored polling event'),
        },
    };
}
