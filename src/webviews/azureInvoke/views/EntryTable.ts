/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type HttpHeaderOrQueryParameter } from '../../../azureInvoke/models/httpSchema';
import { type HttpRequestViewLabels } from '../shared/invocationEditorProtocol';

/**
 * Editable rows of name, value, and an enabled checkbox, used for query parameters and headers.
 * Typing in a row bubbles an `input` event to the surrounding form. Adding or removing a row fires no event,
 * so the table calls `onChange` for those itself.
 */
export class EntryTable {
    public constructor(
        private readonly rows: HTMLElement,
        private readonly addButton: HTMLButtonElement,
        entries: HttpHeaderOrQueryParameter[],
        private readonly labels: Pick<HttpRequestViewLabels, 'name' | 'value' | 'enabled' | 'remove'>,
        private readonly onChange: () => void,
    ) {
        // Always show at least one row, so there's somewhere to start typing.
        if (entries.length) {
            entries.forEach(entry => this.append(entry));
        } else {
            this.append();
        }

        addButton.addEventListener('click', () => {
            this.append();
            this.onChange();
            // Move focus to the new row's name field.
            rows.lastElementChild?.querySelector('input')?.focus();
        });
    }

    /**
     * Returns the current rows as new objects, including unchecked rows.
     */
    public read(): HttpHeaderOrQueryParameter[] {
        return Array.from(this.rows.children, row => {
            const [name, value, enabled] = row.querySelectorAll('input');
            return {
                name: name.value,
                value: value.value,
                // Omit `enabled` when it's the default (checked) and the original entry didn't set it,
                // so an untouched row saves back in the same shape it loaded in.
                ...((row instanceof HTMLElement && row.dataset.explicitEnabled === 'true') || !enabled.checked ? { enabled: enabled.checked } : {}),
            };
        });
    }

    /**
     * Adds a row at the end of the table, filled from `entry` or empty.
     */
    private append(entry?: HttpHeaderOrQueryParameter): void {
        const row = document.createElement('div');
        row.className = 'entry-row';
        // Remember whether the original entry set `enabled`, so `read` can keep that shape.
        row.dataset.explicitEnabled = String(entry?.enabled !== undefined);

        const name = this.createInput(this.labels.name, entry?.name);
        const value = this.createInput(this.labels.value, entry?.value);
        const enabled = this.createEnabledCheckbox(entry?.enabled !== false);
        const remove = this.createRemoveButton(row);

        // Typing a value turns the row back on, on the assumption that a filled-in value is meant to be sent.
        value.addEventListener('input', () => {
            if (value.value) {
                enabled.checked = true;
            }
        });

        row.append(name, value, enabled, remove);
        this.rows.append(row);
    }

    /**
     * Creates a text field labelled for screen readers, with spellcheck off because names and values are code.
     */
    private createInput(label: string, value = ''): HTMLInputElement {
        const input = document.createElement('input');
        input.placeholder = label;
        input.setAttribute('aria-label', label);
        input.spellcheck = false;
        input.value = value;
        return input;
    }

    /**
     * Creates the checkbox that controls whether the row is sent. Unchecked rows stay in the table and in saved files.
     */
    private createEnabledCheckbox(checked: boolean): HTMLInputElement {
        const enabled = document.createElement('input');
        enabled.type = 'checkbox';
        enabled.checked = checked;
        enabled.setAttribute('aria-label', this.labels.enabled);
        return enabled;
    }

    /**
     * Creates the button that deletes `row`, then moves focus to the add button so keyboard users don't lose their place.
     */
    private createRemoveButton(row: HTMLElement): HTMLButtonElement {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'secondary';
        remove.textContent = '\u00d7';
        remove.title = this.labels.remove;
        remove.setAttribute('aria-label', this.labels.remove);
        remove.addEventListener('click', () => {
            row.remove();
            this.onChange();
            this.addButton.focus();
        });
        return remove;
    }
}
