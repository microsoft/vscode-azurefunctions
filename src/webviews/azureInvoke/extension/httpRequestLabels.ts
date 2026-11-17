/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../localize';
import { type HttpRequestViewLabels } from '../shared/invocationEditorProtocol';

export function getHttpRequestViewLabels(): HttpRequestViewLabels {
    return {
        subtitle: localize('azureInvoke.subtitle', 'HTTP trigger'),
        method: localize('azureInvoke.method', 'Method'),
        url: localize('azureInvoke.url', 'Request URL'),
        send: localize('azureInvoke.send', 'Send'),
        sending: localize('azureInvoke.sending', 'Sending...'),
        cancel: localize('azureInvoke.cancel', 'Cancel'),
        params: localize('azureInvoke.params', 'Query parameters'),
        headers: localize('azureInvoke.headers', 'Headers'),
        body: localize('azureInvoke.body', 'Body'),
        name: localize('azureInvoke.name', 'Name'),
        value: localize('azureInvoke.value', 'Value'),
        add: localize('azureInvoke.addRow', 'Add row'),
        remove: localize('azureInvoke.removeRow', 'Remove row'),
        response: localize('azureInvoke.response', 'Response'),
        responsePlaceholder: localize('azureInvoke.responsePlaceholder', 'Send a request to see the response. Redirects are shown without following them.'),
        requestBody: localize('azureInvoke.requestBody', 'Request body'),
        requestOptions: localize('azureInvoke.requestOptions', 'Request options'),
        getBodyHint: localize('azureInvoke.getBodyHint', 'GET and HEAD requests do not send a body.'),
        functionKeyHint: localize('azureInvoke.functionKeyHint', 'For Azure Functions endpoints that require a function key, add it as an x-functions-key header.'),
        rename: localize('azureInvoke.rename', 'Rename invocation'),
        save: localize('azureInvoke.save', 'Save'),
        saving: localize('azureInvoke.saving', 'Saving...'),
        saved: localize('azureInvoke.saved', 'Saved for this session'),
        unsaved: localize('azureInvoke.unsaved', 'Unsaved changes'),
        savedInvocationHint: localize('azureInvoke.savedInvocationHint', 'Using the saved invocation. Unsaved editor changes are not included.'),
        enabled: localize('azureInvoke.enabled', 'Enabled'),
        dependencies: {
            title: localize('azureInvoke.dependencies', 'Dependencies'),
            prerequisites: localize('azureInvoke.prerequisites', 'Prerequisite requests'),
            values: localize('azureInvoke.linkedValues', 'Linked values'),
            name: localize('azureInvoke.variableName', 'Variable'),
            source: localize('azureInvoke.sourceRequest', 'Source request'),
            pointer: localize('azureInvoke.valueSelector', 'Request or response selector'),
            selectSource: localize('azureInvoke.selectSource', 'Select a request'),
            search: localize('azureInvoke.searchRequests', 'Search requests...'),
            noResults: localize('azureInvoke.noMatchingRequests', 'No matching requests'),
            unavailable: localize('azureInvoke.unavailableSource', 'Unavailable request'),
            add: localize('azureInvoke.addLinkedValue', 'Add linked value'),
            remove: localize('azureInvoke.removeLinkedValue', 'Remove linked value'),
            hint: localize('azureInvoke.dependenciesHint', 'Search for a prerequisite or link a value using /body/id, /headers/location, /status, or /request/body/email. Use {{accountId}} in request values. Quoted JSON placeholders keep their JSON type. {{guid}} generates one UUID per request run. Link /request/body fields to reuse generated credentials in later requests. Send reuses successful results; Run chain reruns prerequisites and can change data.'),
            runChain: localize('azureInvoke.runChain', 'Run chain'),
        },
    };
}
