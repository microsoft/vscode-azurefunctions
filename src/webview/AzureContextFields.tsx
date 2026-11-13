/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference lib="dom" />

import { Combobox, Option } from '@fluentui/react-components';
import { useEffect, useState, type JSX, type KeyboardEvent, type MouseEvent } from 'react';

const showAllSubscriptionsValue = '__showAllSubscriptions__';
const useFilteredSubscriptionsValue = '__useFilteredSubscriptions__';
const signInValue = '__signIn__';

interface AzureContextLabels {
    subscription: string;
    region: string;
    loadingSubscriptions: string;
    selectSubscription: string;
    loadingRegions: string;
    selectRegion: string;
    recommendedRegions: string;
    otherRegions: string;
    showAllSubscriptions?: string;
    useFilteredSubscriptions?: string;
}

interface AzureSubscriptionOption {
    id: string;
    label: string;
}

interface AzureLocationOption {
    name: string;
    label: string;
    regionCategory?: string;
}

export function AzureContextFields({
    labels,
    locations,
    locationsLoading,
    selectedRegion,
    selectedSubscriptionId,
    signInRequired,
    signInLabel,
    showingAllSubscriptions = false,
    showSubscriptionIds = true,
    subscriptions,
    subscriptionsLoading,
    disabled = false,
    subscriptionInputId,
    regionSelectId,
    onRequestSignIn,
    onShowAllSubscriptions,
    onUseFilteredSubscriptions,
    onSelectRegion,
    onSelectSubscription,
}: {
    labels: AzureContextLabels;
    locations: readonly AzureLocationOption[];
    locationsLoading: boolean;
    selectedRegion: string;
    selectedSubscriptionId: string;
    signInRequired: boolean;
    signInLabel?: string;
    showingAllSubscriptions?: boolean;
    showSubscriptionIds?: boolean;
    subscriptions: readonly AzureSubscriptionOption[];
    subscriptionsLoading: boolean;
    disabled?: boolean;
    subscriptionInputId?: string;
    regionSelectId?: string;
    onRequestSignIn: () => void;
    onShowAllSubscriptions?: () => void;
    onUseFilteredSubscriptions?: () => void;
    onSelectRegion: (region: string) => void;
    onSelectSubscription: (subscriptionId: string) => void;
}): JSX.Element {
    const selectedSubscription = subscriptions.find(subscription =>
        subscription.id === selectedSubscriptionId);
    const [subscriptionQuery, setSubscriptionQuery] = useState(selectedSubscription?.label ?? '');
    useEffect(() => {
        setSubscriptionQuery(selectedSubscription?.label ?? '');
    }, [selectedSubscription?.label]);
    const filteredSubscriptions = filterSubscriptionOptions(subscriptions, subscriptionQuery, selectedSubscriptionId);
    const modeActionLabel = labels.showAllSubscriptions && labels.useFilteredSubscriptions ?
        getSubscriptionModeActionLabel(showingAllSubscriptions, {
            showAllSubscriptions: labels.showAllSubscriptions,
            useFilteredSubscriptions: labels.useFilteredSubscriptions,
        }) : undefined;
    const modeAction = showingAllSubscriptions ? onUseFilteredSubscriptions : onShowAllSubscriptions;
    const locationGroups = partitionConnectorLocations(locations);
    const requestSignIn = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>): void => {
        if (signInLabel || disabled || !shouldRequestAzureSignIn(signInRequired, subscriptionsLoading)) {
            return;
        }
        event.preventDefault();
        onRequestSignIn();
    };

    return (
        <div className="azure-context-fields">
            <label>
                <span>{labels.subscription}</span>
                <Combobox
                    id={subscriptionInputId}
                    aria-label={labels.subscription}
                    className="subscription-combobox"
                    disabled={disabled || subscriptionsLoading}
                    inlinePopup
                    listbox={{ className: 'subscription-combobox-listbox' }}
                    placeholder={subscriptionsLoading ? labels.loadingSubscriptions : labels.selectSubscription}
                    selectedOptions={selectedSubscriptionId ? [selectedSubscriptionId] : []}
                    value={subscriptionQuery}
                    onChange={event => setSubscriptionQuery(event.target.value)}
                    onClick={requestSignIn}
                    onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            requestSignIn(event);
                        }
                    }}
                    onOpenChange={(_event, data) => {
                        if (!data.open) {
                            setSubscriptionQuery(selectedSubscription?.label ?? '');
                        }
                    }}
                    onOptionSelect={(_event, data) => {
                        if (data.optionValue === signInValue && signInRequired && !subscriptions.length) {
                            onRequestSignIn();
                            setSubscriptionQuery(selectedSubscription?.label ?? '');
                        } else if (selectSubscriptionOption(data.optionValue, {
                            onShowAllSubscriptions,
                            onUseFilteredSubscriptions,
                            onSelectSubscription: subscriptionId => {
                                const subscription = subscriptions.find(option => option.id === subscriptionId);
                                setSubscriptionQuery(subscription?.label ?? '');
                                onSelectSubscription(subscriptionId);
                            },
                        })) {
                            if (data.optionValue === showAllSubscriptionsValue || data.optionValue === useFilteredSubscriptionsValue) {
                                setSubscriptionQuery(selectedSubscription?.label ?? '');
                            }
                        }
                    }}
                >
                    {filteredSubscriptions.map(subscription =>
                        <Option key={subscription.id} text={showSubscriptionIds ? `${subscription.label} ${subscription.id}` : subscription.label}
                            value={subscription.id}>
                            <span className="subscription-option">
                                <strong>{subscription.label}</strong>
                                {showSubscriptionIds && <small>{subscription.id}</small>}
                            </span>
                        </Option>
                    )}
                    {signInRequired && !subscriptions.length && signInLabel &&
                        <Option text={signInLabel} value={signInValue}>{signInLabel}</Option>}
                    {modeActionLabel && modeAction &&
                        <Option text={modeActionLabel} value={showingAllSubscriptions ? useFilteredSubscriptionsValue : showAllSubscriptionsValue}>
                            {modeActionLabel}
                        </Option>}
                </Combobox>
            </label>
            <label>
                <span>{labels.region}</span>
                <select
                    id={regionSelectId}
                    disabled={disabled || !selectedSubscriptionId || locationsLoading || !locations.length}
                    value={selectedRegion}
                    onChange={event => onSelectRegion(event.target.value)}
                >
                    <option value="">{locationsLoading ? labels.loadingRegions : labels.selectRegion}</option>
                    {locationGroups.recommended.length > 0 &&
                        <optgroup label={labels.recommendedRegions}>
                            {locationGroups.recommended.map(location =>
                                <option key={location.name} value={location.name}>{location.label}</option>
                            )}
                        </optgroup>}
                    {locationGroups.other.length > 0 &&
                        <optgroup label={labels.otherRegions}>
                            {locationGroups.other.map(location =>
                                <option key={location.name} value={location.name}>{location.label}</option>
                            )}
                        </optgroup>}
                </select>
            </label>
        </div>
    );
}

export function partitionConnectorLocations(
    locations: readonly AzureLocationOption[],
): { recommended: AzureLocationOption[]; other: AzureLocationOption[] } {
    return {
        recommended: locations.filter(location => location.regionCategory?.toLowerCase() === 'recommended'),
        other: locations.filter(location => location.regionCategory?.toLowerCase() !== 'recommended'),
    };
}

export function selectSubscriptionOption(optionValue: string | undefined, actions: {
    onShowAllSubscriptions?: () => void;
    onUseFilteredSubscriptions?: () => void;
    onSelectSubscription: (subscriptionId: string) => void;
}): boolean {
    if (!optionValue) {
        return false;
    }
    if (optionValue === showAllSubscriptionsValue) {
        actions.onShowAllSubscriptions?.();
    } else if (optionValue === useFilteredSubscriptionsValue) {
        actions.onUseFilteredSubscriptions?.();
    } else {
        actions.onSelectSubscription(optionValue);
    }
    return true;
}

export function shouldRequestAzureSignIn(signInRequired: boolean, subscriptionsLoading: boolean): boolean {
    return signInRequired && !subscriptionsLoading;
}

export function filterSubscriptionOptions(
    subscriptions: readonly AzureSubscriptionOption[],
    query: string,
    selectedSubscriptionId: string,
): AzureSubscriptionOption[] {
    const normalized = query.trim().toLocaleLowerCase();
    const selected = subscriptions.find(subscription => subscription.id === selectedSubscriptionId);
    if (!normalized || normalized === selected?.label.toLocaleLowerCase()) {
        return [...subscriptions];
    }
    return subscriptions.filter(subscription =>
        subscription.label.toLocaleLowerCase().includes(normalized) || subscription.id.toLocaleLowerCase().includes(normalized));
}

export function getSubscriptionModeActionLabel(
    showingAllSubscriptions: boolean,
    labels: { showAllSubscriptions: string; useFilteredSubscriptions: string },
): string {
    return showingAllSubscriptions ? labels.useFilteredSubscriptions : labels.showAllSubscriptions;
}
