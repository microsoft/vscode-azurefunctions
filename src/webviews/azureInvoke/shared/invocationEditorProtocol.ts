/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type HttpRequestStateMessage } from '../../../azureInvoke/models/httpRunModel';
import { type HttpRequest } from '../../../azureInvoke/models/httpSchema';

/*
 * The contract between an invocation editor tab (InvocationEditor, in the extension) and its webview
 * (httpRequestView, in the browser bundle) - the messages each side sends, the initial configuration,
 * and the localized labels. Both sides compile against this file, so keep it browser-safe.
 */

/**
 * Messages from the webview to the extension.
 */
export type HttpRequestMessage =
    // The webview is listening. The extension replies with the dependency sources and replays any run in progress.
    | { command: 'ready' }
    // Send the form's current request, which may have unsaved edits. With `runDependencies`, prerequisites run first.
    | { command: 'sendRequest'; request: HttpRequest; runDependencies?: boolean }
    // Save the form's current request. The extension replies with `requestSaved` or `saveError`.
    | { command: 'saveRequest'; request: HttpRequest }
    // Ask the extension to prompt for a new name. It replies with `renamed`.
    | { command: 'renameRequest' }
    // Cancel the run in progress.
    | { command: 'abortRequest' };

/**
 * Messages from the extension to the webview.
 */
export type HttpResponseMessage =
    // Run progress for this invocation: started, response, or error. The run may have been started outside this tab.
    | HttpRequestStateMessage
    // The last `saveRequest` was stored.
    | { command: 'requestSaved' }
    // The last `saveRequest` failed. `message` is shown above the form.
    | { command: 'saveError'; message: string }
    // The invocation was renamed. The new name counts as unsaved until the next save.
    | { command: 'renamed'; name: string }
    // The saved invocations this request can link to changed.
    | { command: 'sources'; sources: InvocationSource[] };

/**
 * An option in the dependency pickers. Only the ID and name cross to the webview; request details stay in the extension.
 */
export interface InvocationSource {
    /**
     * Invocation ID, stored in `dependsOn` and in each binding's `sourceId`.
     */
    id: string;
    /**
     * Display name shown in the picker.
     */
    name: string;
}

/**
 * Initial state embedded in the webview page. Later changes arrive as messages.
 */
export interface HttpRequestViewConfiguration {
    /**
     * Every user-visible string the webview shows.
     */
    labels: HttpRequestViewLabels;
    /**
     * Invocation name shown as the editor heading.
     */
    name: string;
    /**
     * Request the form starts with.
     */
    request: HttpRequest;
    /**
     * Whether the initial form matches an invocation already in the session collection. A new draft starts unsaved.
     */
    saved: boolean;
    /**
     * Saved invocations the Dependencies tab can link to, other than this one.
     */
    sources?: InvocationSource[];
}

/**
 * Localized strings supplied by the extension, so the browser bundle needs no VS Code imports.
 * Grouped by the part of the editor that shows them.
 */
export interface HttpRequestViewLabels {
    // ---- Header ----
    /**
     * Small text next to the invocation name, naming the trigger type.
     */
    subtitle: string;
    /**
     * Tooltip and accessible name of the pencil button next to the name.
     */
    rename: string;
    save: string;
    /**
     * Save button text while a save is in flight.
     */
    saving: string;
    /**
     * Status text next to Save when the form matches the saved invocation.
     */
    saved: string;
    /**
     * Status text next to Save when the form has changes that aren't saved.
     */
    unsaved: string;

    // ---- Request bar ----
    /**
     * Accessible name of the method dropdown.
     */
    method: string;
    /**
     * Accessible name of the URL field.
     */
    url: string;
    send: string;
    /**
     * Send button text, and the response status text, while a run is in progress.
     */
    sending: string;
    /**
     * Button that cancels the run in progress. Shown only while running.
     */
    cancel: string;
    /**
     * Hint under the request bar about passing a function key.
     */
    functionKeyHint: string;

    // ---- Tabs ----
    /**
     * Accessible name of the tab list.
     */
    requestOptions: string;
    /**
     * Query parameters tab title.
     */
    params: string;
    /**
     * Headers tab title, also used as the summary of the response headers section.
     */
    headers: string;
    /**
     * Body tab title.
     */
    body: string;

    // ---- Query parameter and header rows ----
    /**
     * Placeholder and accessible name of a row's name field.
     */
    name: string;
    /**
     * Placeholder and accessible name of a row's value field.
     */
    value: string;
    /**
     * Accessible name of a row's checkbox, which controls whether the row is sent.
     */
    enabled: string;
    /**
     * Button under the rows that adds an empty row.
     */
    add: string;
    /**
     * Tooltip and accessible name of a row's × button.
     */
    remove: string;

    // ---- Body ----
    /**
     * Accessible name of the body text area.
     */
    requestBody: string;
    /**
     * Shown under the body when the method is GET or HEAD, which can't send one.
     */
    getBodyHint: string;

    // ---- Response ----
    /**
     * Heading of the response section.
     */
    response: string;
    /**
     * Shown in the response section before the first run.
     */
    responsePlaceholder: string;
    /**
     * Shown when a run used the saved invocation instead of the form, such as a run started by a tool.
     */
    savedInvocationHint: string;

    // ---- Dependencies tab ----
    dependencies: DependencyLabels;
}

/**
 * Localized strings for the Dependencies tab and its pickers.
 */
export interface DependencyLabels {
    /**
     * Dependencies tab title.
     */
    title: string;
    /**
     * Heading and accessible name of the picker for requests this one waits on.
     */
    prerequisites: string;
    /**
     * Heading of the section that links `{{name}}` placeholders to values from other requests.
     */
    values: string;
    /**
     * Caption above a linked value's variable name field.
     */
    name: string;
    /**
     * Caption above a linked value's source request picker, and the accessible name of every request picker's search field.
     */
    source: string;
    /**
     * Caption above a linked value's selector field, such as `/body/id`.
     */
    pointer: string;
    /**
     * Accessible name of a picker's list of requests.
     */
    selectSource: string;
    /**
     * Placeholder of a picker's search field.
     */
    search: string;
    /**
     * Shown in a picker when no request matches the search.
     */
    noResults: string;
    /**
     * Shown in place of the name of a linked request that is no longer in the collection.
     */
    unavailable: string;
    /**
     * Button that adds a linked value.
     */
    add: string;
    /**
     * Accessible name of a linked value's remove button.
     */
    remove: string;
    /**
     * Help text at the top of the tab explaining selectors, placeholders, and Send versus Run chain.
     */
    hint: string;
    /**
     * Button in the request bar that runs the prerequisites, then this request. Shown only when there are prerequisites.
     */
    runChain: string;
}
