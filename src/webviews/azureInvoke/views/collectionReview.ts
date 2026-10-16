/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type CollectionReviewConfiguration, type CollectionReviewMessage, type CollectionReviewResponse, type CollectionReviewState, type InvocationCandidate, type InvocationSelection } from '../shared/collectionReview';
import { HttpRequestPreview } from './HttpRequestPreview';
import './collectionReview.css';

export function render(_viewName: string, api: { postMessage(message: CollectionReviewMessage): void }): void {
    const config: CollectionReviewConfiguration = JSON.parse(decodeURIComponent(window.config._initialData));
    const { labels } = config;
    const main = document.createElement('main');
    const loading = document.createElement('div');
    loading.className = 'review-loading';
    loading.id = 'review-loading';
    loading.setAttribute('role', 'status');
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const loadingTitle = document.createElement('h1');
    loadingTitle.textContent = labels.loadingTitle;
    const loadingMessage = document.createElement('p');
    loadingMessage.className = 'hint';
    loadingMessage.textContent = labels.loadingMessage;
    loading.append(spinner, loadingTitle, loadingMessage);
    const heading = document.createElement('h1');
    heading.textContent = labels.title;
    const introduction = document.createElement('p');
    introduction.className = 'hint';
    introduction.textContent = labels.introduction;
    const selectAllLabel = document.createElement('label');
    selectAllLabel.className = 'select-all';
    const selectAll = document.createElement('input');
    selectAll.type = 'checkbox';
    selectAllLabel.append(selectAll, document.createTextNode(labels.selectAll));
    const list = document.createElement('div');
    list.className = 'case-list';
    let rows: { candidate: InvocationCandidate; checkbox: HTMLInputElement; toggle: HTMLButtonElement; comment: HTMLTextAreaElement; status: HTMLElement; preview?: HttpRequestPreview; diagnose?: HTMLButtonElement; locked: boolean }[] = [];
    const footer = document.createElement('footer');
    const count = document.createElement('span');
    count.setAttribute('role', 'status');
    const confirm = document.createElement('button');
    confirm.id = 'confirm-collection';
    confirm.textContent = labels.confirm;
    const diagnoseAll = document.createElement('button');
    diagnoseAll.id = 'diagnose-failed';
    diagnoseAll.className = 'secondary';
    diagnoseAll.textContent = labels.diagnoseFailed;
    diagnoseAll.title = labels.diagnosisHint;
    const diagnosisHint = document.createElement('p');
    diagnosisHint.className = 'hint diagnosis-hint';
    diagnosisHint.textContent = labels.diagnosisHint;
    const diagnosisNotice = document.createElement('p');
    diagnosisNotice.id = 'diagnosis-notice';
    diagnosisNotice.setAttribute('role', 'status');
    const cancel = document.createElement('button');
    cancel.id = 'cancel-collection';
    cancel.className = 'secondary';
    cancel.textContent = labels.cancel;
    const message = document.createElement('p');
    message.id = 'review-message';
    message.setAttribute('role', 'status');
    const error = document.createElement('p');
    error.id = 'review-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    let state: CollectionReviewState = config.loading ? 'loading' : 'reviewing';
    let submitting = false;
    let diagnosing = false;
    let version = -1;
    function populate(candidates: InvocationCandidate[], nextVersion: number, selections?: InvocationSelection[]): void {
        if (nextVersion <= version) {
            return;
        }
        version = nextVersion;
        const expanded = new Set(rows.filter(row => row.toggle.getAttribute('aria-expanded') === 'true').map(row => row.candidate.id));
        const groups = new Map<string, HTMLElement>();
        list.replaceChildren();
        rows = candidates.map((candidate, index) => {
            const groupName = candidate.group.trim();
            const groupKey = groupName.toLowerCase();
            let group = groups.get(groupKey);
            if (!group) {
                group = document.createElement('section');
                group.className = 'case-group';
                const groupHeading = document.createElement('h2');
                groupHeading.className = 'group-heading';
                groupHeading.id = `case-group-${groups.size}`;
                groupHeading.textContent = groupName;
                group.setAttribute('aria-labelledby', groupHeading.id);
                group.append(groupHeading);
                groups.set(groupKey, group);
                list.append(group);
            }
            const card = document.createElement('section');
            card.className = 'case';
            card.dataset.id = candidate.id;
            const summary = document.createElement('div');
            summary.className = 'case-row';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.caseId = candidate.id;
            checkbox.setAttribute('aria-label', candidate.name);
            const selection = selections?.find(selection => selection.id === candidate.id);
            checkbox.checked = candidate.trigger === 'http' && (selection?.selected ?? true);
            checkbox.disabled = candidate.trigger !== 'http';
            checkbox.addEventListener('change', updateSelection);
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'case-toggle';
            toggle.setAttribute('aria-expanded', String(expanded.has(candidate.id)));
            const chevron = document.createElement('span');
            chevron.className = 'case-chevron';
            chevron.setAttribute('aria-hidden', 'true');
            const title = document.createElement('span');
            title.className = 'case-name';
            title.textContent = candidate.name;
            title.title = candidate.name;
            toggle.append(chevron, title);
            if (candidate.trigger === 'http') {
                const auth = document.createElement('span');
                auth.className = `auth-indicator auth-${candidate.auth}`;
                auth.title = labels[candidate.auth];
                auth.setAttribute('aria-label', labels[candidate.auth]);
                const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                icon.setAttribute('viewBox', '0 0 16 16');
                icon.setAttribute('aria-hidden', 'true');
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', candidate.auth === 'unknown' ?
                    'M6 5a2 2 0 1 1 3 1.7C8 7.3 8 8 8 9M8 11v1' :
                    candidate.auth === 'anonymous' ? 'M5 7V5a3 3 0 0 1 5.8-1M4 7h8v7H4Z' : 'M5 7V5a3 3 0 0 1 6 0v2M4 7h8v7H4Z');
                icon.append(path);
                auth.append(icon);
                toggle.append(auth);
            }
            const status = document.createElement('span');
            status.className = 'case-status';
            status.setAttribute('role', 'status');
            const details = document.createElement('div');
            details.className = 'case-details';
            details.id = `case-details-${index}`;
            details.hidden = !expanded.has(candidate.id);
            toggle.setAttribute('aria-controls', details.id);
            toggle.addEventListener('click', () => {
                details.hidden = !details.hidden;
                toggle.setAttribute('aria-expanded', String(!details.hidden));
            });
            const description = document.createElement('p');
            description.className = 'case-description';
            description.textContent = candidate.description;
            details.append(description);
            let preview: HttpRequestPreview | undefined;
            let diagnose: HTMLButtonElement | undefined;
            if (candidate.trigger === 'http') {
                preview = new HttpRequestPreview(candidate, labels,
                    (request, runDependencies) => api.postMessage({
                        command: 'previewRequest', id: candidate.id, request, runDependencies,
                        requests: rows.flatMap(row => row.preview ? [{ id: row.candidate.id, request: row.preview.request }] : []),
                    }),
                    () => api.postMessage({ command: 'cancelPreview', id: candidate.id }),
                    updateSelection,
                    candidates.filter(source => source.trigger === 'http' && source.id !== candidate.id).map(({ id, name }) => ({ id, name })));
                if (selection?.request) {
                    preview.setRequest(selection.request);
                }
                details.append(preview.element);
                diagnose = document.createElement('button');
                diagnose.type = 'button';
                diagnose.className = 'secondary diagnose-preview';
                diagnose.textContent = labels.diagnoseRequest;
                diagnose.title = labels.diagnosisHint;
                diagnose.addEventListener('click', () => diagnoseRequests([candidate.id]));
                details.append(diagnose);
            } else {
                const endpoint = document.createElement('p');
                endpoint.className = 'endpoint';
                endpoint.textContent = `${candidate.trigger.toUpperCase()} ${candidate.endpoint}`;
                details.append(endpoint);
                status.textContent = labels.unsupported;
            }
            const commentLabel = document.createElement('label');
            commentLabel.className = 'comment-label';
            commentLabel.textContent = labels.comment;
            const comment = document.createElement('textarea');
            comment.rows = 2;
            comment.maxLength = 2000;
            comment.dataset.commentId = candidate.id;
            comment.value = selection?.comment ?? '';
            comment.addEventListener('input', updateSelection);
            commentLabel.append(comment);
            if (candidate.trigger === 'http' && !config.updatingSaved) {
                details.append(commentLabel);
            }
            summary.append(checkbox, toggle, status);
            card.append(summary, details);
            group.append(card);
            return { candidate, checkbox, toggle, comment, status, preview, diagnose, locked: false };
        });
        updateSelection();
    }

    function updateSelection(): void {
        const selected = rows.filter(row => row.checkbox.checked);
        const supported = rows.filter(row => row.candidate.trigger === 'http');
        count.textContent = `${labels.selected}: ${selected.length}`;
        const feedback = hasFeedback();
        const running = rows.some(row => row.preview?.running);
        const failures = rows.filter(row => row.preview?.failed);
        diagnoseAll.hidden = !!config.updatingSaved || state !== 'reviewing' || !failures.length;
        diagnoseAll.disabled = submitting || diagnosing || running;
        diagnosisHint.hidden = diagnoseAll.hidden;
        for (const row of rows) {
            if (row.diagnose) {
                row.diagnose.hidden = !!config.updatingSaved || state !== 'reviewing' || !row.preview?.failed;
                row.diagnose.disabled = submitting || diagnosing || running;
            }
        }
        confirm.textContent = feedback ? labels.requestChanges : labels.confirm;
        confirm.disabled = submitting || diagnosing || (!selected.length && !feedback) || (state !== 'reviewing' && state !== 'approved') || running;
        selectAll.checked = !!supported.length && selected.length === supported.length;
        selectAll.indeterminate = !!selected.length && selected.length < supported.length;
        selectAll.disabled = diagnosing || state !== 'reviewing' || !supported.length;
        confirm.title = selected.length || feedback ? confirm.textContent : labels.selectCases;
    }
    function hasFeedback(): boolean {
        return !config.updatingSaved && rows.some(row => row.candidate.trigger === 'http' && !!row.comment.value.trim());
    }
    function diagnoseRequests(ids: string[]): void {
        submitting = true;
        error.hidden = true;
        updateSelection();
        api.postMessage({
            command: 'diagnoseRequests', ids,
            requests: rows.flatMap(row => row.preview ? [{ id: row.candidate.id, request: row.preview.request }] : []),
        });
    }
    diagnoseAll.addEventListener('click', () => diagnoseRequests(rows.filter(row => row.preview?.failed).map(row => row.candidate.id)));
    function updateState(): void {
        const discovering = state === 'loading' || state === 'revising';
        loadingTitle.textContent = state === 'revising' ? labels.revisingTitle : labels.loadingTitle;
        loadingMessage.textContent = state === 'revising' ? labels.revisingMessage : labels.loadingMessage;
        loading.hidden = !discovering;
        main.classList.toggle('is-loading', discovering);
        main.setAttribute('aria-busy', String(discovering));
        heading.hidden = discovering;
        introduction.hidden = discovering;
        selectAllLabel.hidden = state !== 'reviewing';
        list.hidden = discovering || state === 'failed';
        count.hidden = discovering || state === 'failed';
        confirm.hidden = state !== 'reviewing' && !(state === 'approved' && !error.hidden);
        cancel.hidden = state === 'approved' || state === 'cancelled';
        message.textContent = state === 'approved' ? labels.approved : state === 'cancelled' ? labels.cancelled : '';
        updateSelection();
    }
    selectAll.addEventListener('change', () => {
        for (const row of rows) {
            if (row.candidate.trigger === 'http') {
                row.checkbox.checked = selectAll.checked;
            }
        }
        updateSelection();
    });
    confirm.addEventListener('click', () => {
        submitting = true;
        error.hidden = true;
        updateSelection();
        const feedback = hasFeedback();
        api.postMessage({
            command: feedback ? 'requestChanges' : 'confirmCollection',
            selections: rows.filter(row => row.candidate.trigger === 'http' && (feedback || row.checkbox.checked))
                .map(row => ({ id: row.candidate.id, comment: row.comment.value, request: row.preview?.request, selected: row.checkbox.checked })),
        });
    });
    cancel.addEventListener('click', () => api.postMessage({ command: 'cancelCollection' }));
    window.addEventListener('message', (event: MessageEvent<CollectionReviewResponse>) => {
        const response = event.data;
        if (response.command === 'proposal') {
            populate(response.candidates, response.version, response.selections);
        }
        if (response.command === 'state' || response.command === 'proposal') {
            if (response.version !== version) {
                return;
            }
            state = response.state;
            diagnosing = response.diagnosing;
            diagnosisNotice.textContent = response.diagnosisNotice ?? '';
            submitting = false;
            error.textContent = response.error ?? '';
            error.hidden = !response.error;
            for (const row of rows) {
                const selection = response.selections.find(selection => selection.id === row.candidate.id);
                if (selection && (!row.locked || state === 'approved' || state === 'revising')) {
                    row.checkbox.checked = selection.selected ?? true;
                    row.comment.value = selection.comment;
                    if (selection.request) {
                        row.preview?.setRequest(selection.request);
                    }
                    row.locked = true;
                } else if (state === 'approved' && !selection) {
                    row.checkbox.checked = false;
                }
                row.checkbox.disabled = diagnosing || state !== 'reviewing' || row.candidate.trigger !== 'http';
                row.comment.disabled = diagnosing || state !== 'reviewing';
                row.preview?.setEnabled(!diagnosing && state === 'reviewing');
                const status = response.statuses.find(status => status.id === row.candidate.id);
                if (status) {
                    row.status.textContent = status.text;
                }
            }
            updateState();
        } else if (response.command === 'preview' && response.version === version) {
            rows.find(row => row.candidate.id === response.id)?.preview?.update(response.message);
        }
    });
    footer.append(count, diagnoseAll, confirm, cancel);
    main.append(loading, heading, introduction, selectAllLabel, list, diagnosisHint, diagnosisNotice, message, error, footer);
    const root = document.querySelector('#root');
    if (!root) {
        throw new Error('Missing collection review root element.');
    }
    root.replaceChildren(main);
    populate(config.candidates, config.version, config.selections);
    updateState();
    api.postMessage({ command: 'ready' });
}
