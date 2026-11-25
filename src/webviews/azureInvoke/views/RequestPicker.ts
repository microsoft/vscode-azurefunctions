/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type DependencyLabels, type InvocationSource } from '../shared/invocationEditorProtocol';

/** Numbers each picker on the page, so every options list gets a unique ID for `aria-controls`. */
let pickerNumber = 0;

/**
 * A searchable picker for choosing a saved invocation, following the ARIA combobox pattern.
 * Typing filters the list by name or ID. The picker's value is the chosen invocation's ID, while the input shows its name.
 */
export class RequestPicker {
    /** Root element to add to the page. */
    public readonly element = document.createElement('div');
    /** Text field the user types in. Shows the chosen invocation's name when not searching. */
    public readonly input = document.createElement('input');
    /** Options matching the current search. */
    private readonly list = document.createElement('ul');
    /** Message shown instead of the list when nothing matches. */
    private readonly empty = document.createElement('p');

    /** Invocations shown in the list, in the same order. */
    private matches: InvocationSource[] = [];
    /** ID of the chosen invocation, or an empty string when nothing is chosen. */
    private selected = '';
    /** Index in `matches` of the option highlighted with the arrow keys, or -1 when none is. */
    private active = -1;

    public constructor(
        /** Invocations that can be chosen. Updated through `setSources`. */
        private sources: InvocationSource[],
        private readonly labels: DependencyLabels,
        /** Called with the ID after the user chooses an invocation. */
        private readonly onSelect: (id: string) => void,
    ) {
        this.element.className = 'request-picker';
        this.setUpInput();
        this.setUpList();
        this.setUpEmptyMessage();
        this.element.append(this.input, this.list, this.empty);

        // Focusing shows every option and selects the text, so typing replaces it as a search.
        this.input.addEventListener('focus', () => {
            this.input.select();
            this.show('');
        });
        this.input.addEventListener('input', () => this.show(this.input.value));

        // Leaving the field discards the search text and shows the chosen invocation's name again.
        this.input.addEventListener('blur', () => {
            this.close();
            this.set(this.selected);
        });

        this.input.addEventListener('keydown', event => this.onKeyDown(event));
    }

    /**
     * The chosen invocation's ID, not its name or the current search text.
     */
    public get value(): string {
        return this.selected;
    }

    /**
     * Chooses the invocation with `id`, or clears the choice when `id` is empty, without calling `onSelect`.
     * If the invocation is no longer available, the input says so instead of showing a name.
     */
    public set(id: string): void {
        this.selected = id;
        this.input.value = id ? this.sources.find(source => source.id === id)?.name ?? this.labels.unavailable : '';
    }

    /**
     * Replaces the invocations that can be chosen, for example after one is saved or renamed.
     */
    public setSources(sources: InvocationSource[]): void {
        this.sources = sources;
        if (document.activeElement !== this.input) {
            // Not searching, so refresh the shown name in case the chosen invocation was renamed or removed.
            this.set(this.selected);
        } else if (!this.list.hidden) {
            // Searching with the list open, so rerun the search against the new list.
            this.show(this.input.value);
        }
    }

    /**
     * Whether the options list or the no-results message is showing.
     */
    private get isOpen(): boolean {
        return this.input.getAttribute('aria-expanded') === 'true';
    }

    /**
     * Sets up the text field as a combobox that controls the options list.
     */
    private setUpInput(): void {
        this.input.type = 'text';
        this.input.placeholder = this.labels.search;
        this.input.autocomplete = 'off';
        this.input.spellcheck = false;
        this.input.setAttribute('role', 'combobox');
        this.input.setAttribute('aria-label', this.labels.source);
        this.input.setAttribute('aria-autocomplete', 'list');
        this.input.setAttribute('aria-expanded', 'false');
    }

    /**
     * Sets up the options list, hidden until the field is focused.
     */
    private setUpList(): void {
        this.list.id = `request-options-${++pickerNumber}`;
        this.list.className = 'request-options';
        this.list.setAttribute('role', 'listbox');
        this.list.setAttribute('aria-label', this.labels.selectSource);
        this.list.hidden = true;
        this.input.setAttribute('aria-controls', this.list.id);
    }

    /**
     * Sets up the no-results message. It's a status region, so screen readers announce it when it appears.
     */
    private setUpEmptyMessage(): void {
        this.empty.className = 'request-picker-empty';
        this.empty.textContent = this.labels.noResults;
        this.empty.setAttribute('role', 'status');
        this.empty.hidden = true;
    }

    /**
     * Handles the keyboard: arrows move the highlight, Enter chooses, and Escape closes and restores the name.
     */
    private onKeyDown(event: KeyboardEvent): void {
        switch (event.key) {
            case 'Escape':
                event.preventDefault();
                // Keep Escape from also reaching the surrounding page.
                event.stopPropagation();
                this.close();
                this.set(this.selected);
                break;

            case 'ArrowDown':
            case 'ArrowUp':
                event.preventDefault();
                if (!this.isOpen) {
                    this.show('');
                }
                // Down moves to the next option and stops at the last.
                // Up moves to the previous option, stops at the first, and starts from the last when nothing is highlighted.
                this.activate(event.key === 'ArrowDown' ? Math.min(this.active + 1, this.matches.length - 1) :
                    this.active < 0 ? this.matches.length - 1 : Math.max(this.active - 1, 0));
                break;

            case 'Enter': {
                if (!this.isOpen) {
                    break;
                }
                event.preventDefault();
                // Choose the highlighted option, or the first match when nothing is highlighted.
                const source = this.matches[this.active >= 0 ? this.active : 0];
                if (source) {
                    this.choose(source);
                }
                break;
            }
        }
    }

    /**
     * Chooses `source`, closes the list, and calls `onSelect`. Does nothing while the field is disabled.
     */
    private choose(source: InvocationSource): void {
        if (this.input.matches(':disabled')) {
            return;
        }

        this.set(source.id);
        this.close();
        this.onSelect(source.id);
    }

    /**
     * Opens the list with the invocations whose name or ID contains `query`, ignoring case. Clears the highlight.
     */
    private show(query: string): void {
        const search = query.trim().toLowerCase();
        this.matches = this.sources.filter(source => source.name.toLowerCase().includes(search) || source.id.toLowerCase().includes(search));
        this.active = -1;
        this.input.removeAttribute('aria-activedescendant');

        // Rebuild the options. Each one shows the name, with the ID underneath to tell apart invocations with the same name.
        this.list.replaceChildren();
        for (const [index, source] of this.matches.entries()) {
            const option = document.createElement('li');
            option.id = `${this.list.id}-${index}`;
            option.dataset.sourceId = source.id;
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', String(source.id === this.selected));

            const name = document.createElement('span');
            name.textContent = source.name;
            const id = document.createElement('small');
            id.textContent = source.id;
            option.append(name, id);

            // Keep focus in the field when an option is pressed. Otherwise blur would close the list before the click lands.
            option.addEventListener('pointerdown', event => event.preventDefault());
            option.addEventListener('click', () => this.choose(source));
            this.list.append(option);
        }

        // Show the list, or the no-results message when nothing matches.
        this.list.hidden = !this.matches.length;
        this.empty.hidden = !!this.matches.length;
        this.input.setAttribute('aria-expanded', 'true');
    }

    /**
     * Highlights the option at `index`, tells screen readers about it, and scrolls it into view.
     */
    private activate(index: number): void {
        this.active = index;
        for (const [optionIndex, option] of [...this.list.children].entries()) {
            option.classList.toggle('active', optionIndex === index);
        }

        const option = this.list.children[index];
        if (option) {
            this.input.setAttribute('aria-activedescendant', option.id);
            option.scrollIntoView({ block: 'nearest' });
        }
    }

    /**
     * Hides the list and the no-results message, and clears the highlight for screen readers.
     */
    private close(): void {
        this.list.hidden = true;
        this.empty.hidden = true;
        this.input.setAttribute('aria-expanded', 'false');
        this.input.removeAttribute('aria-activedescendant');
    }
}
