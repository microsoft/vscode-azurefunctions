/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUserCancelledError, type IActionContext } from '@microsoft/vscode-azext-utils';
import { addValuesToMask } from '../../connectorTrigger/connectorTriggerUtils';
import { localize } from '../../localize';
import {
    isConnectorParameterMessage,
    type ConnectorParameterField,
    type ConnectorParameterFormState,
    type ConnectorParameterOption,
} from '../../webview/connectorTriggerParameters/ConnectorTriggerParametersViewModel';
import {
    type ConnectorTriggerInputDefinition,
    type ConnectorTriggerInputOption,
    type ConnectorTriggerOperationResolver,
    type ConnectorTriggerParameterRequest,
    type ConnectorTriggerParameterValue,
} from './connectorTriggerF5Contracts';

interface ParameterField {
    input: ConnectorTriggerInputDefinition;
    text: string;
    selected: string[];
    options: Map<string, ConnectorTriggerInputOption>;
    levels: { parent?: string; options: string[] }[];
    status: ConnectorParameterField['status'];
    generation: number;
    error?: string;
}

export class ConnectorTriggerParameterForm {
    private readonly fields: ParameterField[];
    private readonly values = new Map<string, ConnectorTriggerParameterValue>();
    private revision = 0;
    private nextOptionId = 0;
    private disposed = false;
    private error: string | undefined;

    public constructor(
        private readonly context: IActionContext,
        private readonly request: ConnectorTriggerParameterRequest,
        private readonly resolver: ConnectorTriggerOperationResolver,
        private readonly onChange: (state: ConnectorParameterFormState) => void,
    ) {
        const inputs = orderConnectorInputs(request.operation.inputs);
        this.fields = inputs.map(input => ({
            input,
            text: '',
            selected: [],
            options: new Map(),
            levels: [],
            status: input.dynamic ? 'idle' : 'ready',
            generation: 0,
        }));
        for (const field of this.fields) {
            if (field.input.dynamic) {
                continue;
            }
            const options = field.input.options ?? (field.input.type === 'boolean' ? [
                { label: localize('booleanTrue', 'True'), value: true },
                { label: localize('booleanFalse', 'False'), value: false },
            ] : undefined);
            if (options) {
                field.levels = [{ options: this.addOptions(field, options) }];
                const defaultValues = field.input.allowMultiple && Array.isArray(field.input.defaultValue) ?
                    field.input.defaultValue : [field.input.defaultValue];
                const defaultOptions = defaultValues.flatMap(value => {
                    const option = [...field.options].find(([, option]) =>
                        JSON.stringify(option.value) === JSON.stringify(value));
                    return option ? [option] : [];
                });
                if (defaultOptions.length) {
                    field.selected = defaultOptions.map(([id]) => id);
                    this.values.set(field.input.name, field.input.allowMultiple ?
                        defaultOptions.map(([, option]) => option.value) : defaultOptions[0][1].value);
                }
            } else if (field.input.defaultValue !== undefined && field.input.defaultValue !== null) {
                const value = field.input.defaultValue;
                field.text = typeof value === 'object' ? JSON.stringify(value) : String(value);
                this.setText(field, field.text);
            }
        }
    }

    public get state(): ConnectorParameterFormState {
        const required = new Set(this.fields.filter(field => field.input.required).map(field => field.input.name));
        // Dependencies precede their dependents, so propagate requiredness in reverse order.
        for (const field of [...this.fields].reverse()) {
            if (required.has(field.input.name) || this.values.has(field.input.name)) {
                for (const dependency of field.input.dynamic?.dependsOn ?? []) {
                    required.add(dependency);
                }
            }
        }
        const fields = this.fields.map((field): ConnectorParameterField => {
            const level = field.levels[field.levels.length - 1];
            return {
                name: field.input.name,
                label: field.input.label,
                description: field.input.description,
                required: required.has(field.input.name),
                advanced: !required.has(field.input.name) && !field.input.dynamic && field.input.visibility !== 'important',
                sensitive: field.input.sensitive === true,
                multiline: field.input.type === 'array' || field.input.type === 'object',
                multiple: field.input.allowMultiple === true,
                dynamic: !!field.input.dynamic,
                kind: field.input.dynamic?.kind === 'tree' ? 'tree' :
                    field.input.dynamic || field.input.options || field.input.type === 'boolean' ? 'choices' : 'text',
                text: field.text,
                selected: [...field.selected],
                selectedLabels: field.selected.flatMap(id => field.options.get(id)?.label ?? []),
                options: (level?.options ?? []).map(id => this.toOption(field, id)),
                parent: level?.parent ? this.toOption(field, level.parent) : undefined,
                canGoBack: field.levels.length > 1,
                status: field.status,
                error: field.error,
                dependencyLabels: this.missingDependencies(field).map(name =>
                    this.fields.find(candidate => candidate.input.name === name)?.input.label ?? name),
            };
        });
        return {
            revision: this.revision,
            fields,
            canSubmit: fields.every(field =>
                !field.required && field.dynamic && !this.values.has(field.name) ||
                !field.error && field.status === 'ready' &&
                (!field.required || this.values.has(field.name))),
            error: this.error,
        };
    }

    public dispose(): void {
        this.disposed = true;
        this.values.clear();
        for (const field of this.fields) {
            field.generation += 1;
            field.options.clear();
            field.text = '';
        }
    }

    public async handleMessage(message: unknown): Promise<Record<string, ConnectorTriggerParameterValue> | undefined> {
        if (this.disposed) {
            return undefined;
        }
        if (!isConnectorParameterMessage(message)) {
            this.error = localize('invalidConnectorParameterMessage', 'The parameter request is invalid. Close this form and retry F5.');
            this.notify();
            return undefined;
        }
        if (message.command === 'initialize') {
            this.notify();
            await this.loadReadyFields();
            return undefined;
        }
        if (message.command === 'cancelParameters') {
            return undefined;
        }
        if (message.revision <= this.revision) {
            this.notify();
            return undefined;
        }
        this.revision = message.revision;
        this.error = undefined;
        if (message.command === 'submit') {
            if (this.state.canSubmit) {
                return Object.fromEntries(this.values);
            }
            this.error = localize('reviewConnectorParameters', 'Complete the required parameters and resolve errors for selected parameters before applying.');
            this.notify();
            return undefined;
        }

        const field = this.fields.find(candidate => candidate.input.name === message.name);
        if (!field) {
            this.error = localize('unknownConnectorParameter', 'This parameter is not part of the selected event. Close this form and retry F5.');
            this.notify();
            return undefined;
        }
        const previousValue = JSON.stringify(this.values.get(field.input.name));
        switch (message.command) {
            case 'edit':
                if (!field.input.dynamic && !field.input.options && field.input.type !== 'boolean') {
                    this.setText(field, message.text);
                } else {
                    field.error = invalidSelection();
                }
                break;
            case 'select': {
                const options = message.optionIds.map(id => field.options.get(id));
                if ((!field.input.allowMultiple && options.length > 1) ||
                    options.some(option => !option || option.selectable === false) ||
                    field.status !== 'ready' || this.missingDependencies(field).length) {
                    field.error = invalidSelection();
                    break;
                }
                field.selected = [...message.optionIds];
                field.error = field.input.required && !options.length ? requiredValue() : undefined;
                this.values.delete(field.input.name);
                if (options.length) {
                    const selectedValues = options.map(option => {
                        if (!option) {
                            throw new Error('Missing validated connector option.');
                        }
                        maskValue(this.context, option.value);
                        return option.value;
                    });
                    this.values.set(field.input.name, field.input.allowMultiple ? selectedValues : selectedValues[0]);
                }
                break;
            }
            case 'browse': {
                const option = field.options.get(message.optionId);
                const level = field.levels[field.levels.length - 1];
                if (field.input.dynamic?.kind !== 'tree' || !option?.hasChildren ||
                    !level?.options.includes(message.optionId) || field.status === 'loading') {
                    field.error = invalidSelection();
                    break;
                }
                await this.loadField(field, message.optionId);
                return undefined;
            }
            case 'back':
                if (field.levels.length > 1) {
                    field.generation += 1;
                    field.levels.pop();
                    field.status = 'ready';
                    field.error = undefined;
                }
                break;
            case 'reload':
                if (field.input.dynamic) {
                    this.clearField(field);
                }
                break;
        }
        if (previousValue !== JSON.stringify(this.values.get(field.input.name))) {
            this.invalidateDependents(field.input.name);
        }
        this.notify();
        await this.loadReadyFields();
        return undefined;
    }

    private setText(field: ParameterField, text: string): void {
        field.text = text;
        maskValue(this.context, text);
        field.error = validateConnectorParameterText(text, field.input);
        this.values.delete(field.input.name);
        if (!field.error && text.trim()) {
            const value = field.input.type === 'integer' || field.input.type === 'number' ? Number(text) :
                field.input.type === 'object' || field.input.type === 'array' ?
                    JSON.parse(text) as ConnectorTriggerParameterValue : text;
            this.values.set(field.input.name, value);
        }
    }

    private async loadReadyFields(): Promise<void> {
        await Promise.all(this.fields
            .filter(field => field.input.dynamic && field.status === 'idle' && !this.missingDependencies(field).length)
            .map(field => this.loadField(field)));
    }

    private async loadField(field: ParameterField, parentId?: string): Promise<void> {
        const generation = ++field.generation;
        field.status = 'loading';
        field.error = undefined;
        this.notify();
        try {
            const resolution = await this.resolver.resolveDynamicInput(this.context, {
                ...this.request,
                input: field.input,
                values: Object.fromEntries(this.values),
                parent: parentId ? field.options.get(parentId) : undefined,
            });
            if (this.disposed || generation !== field.generation) {
                return;
            }
            if (!resolution.options) {
                throw new Error('The connector did not return parameter options.');
            }
            field.levels.push({ parent: parentId, options: this.addOptions(field, resolution.options) });
            field.status = 'ready';
            if (field.input.required && !resolution.options.length && !parentId) {
                field.error = localize('connectorParameterOptionsEmpty', 'The connector returned no values for this required parameter. Check its dependencies and connection access, then retry.');
            }
        } catch (error) {
            if (isUserCancelledError(error)) {
                throw error;
            }
            if (this.disposed || generation !== field.generation) {
                return;
            }
            field.status = 'error';
            field.error = localize('connectorParameterLoadFailed', 'Could not load choices from the connector. Check the connection and parameter dependencies, then retry.');
            this.context.telemetry.properties.connectorF5ParameterLoadResult = 'failed';
        }
        this.notify();
    }

    private addOptions(field: ParameterField, options: readonly ConnectorTriggerInputOption[]): string[] {
        return options.map(option => {
            maskValue(this.context, option.value);
            maskValue(this.context, option.label);
            const id = `option-${++this.nextOptionId}`;
            field.options.set(id, option);
            return id;
        });
    }

    private toOption(field: ParameterField, id: string): ConnectorParameterOption {
        const option = field.options.get(id);
        if (!option) {
            throw new Error('Missing connector parameter option.');
        }
        return { id, label: option.label, hasChildren: option.hasChildren === true, selectable: option.selectable !== false };
    }

    private missingDependencies(field: ParameterField): string[] {
        return (field.input.dynamic?.dependsOn ?? []).filter(name => !this.values.has(name));
    }

    private clearField(field: ParameterField): void {
        field.generation += 1;
        field.text = '';
        field.selected = [];
        field.options.clear();
        field.levels = [];
        field.error = undefined;
        field.status = field.input.dynamic ? 'idle' : 'ready';
        this.values.delete(field.input.name);
    }

    private invalidateDependents(name: string): void {
        for (const field of this.fields.filter(candidate => candidate.input.dynamic?.dependsOn?.includes(name))) {
            this.clearField(field);
            this.invalidateDependents(field.input.name);
        }
    }

    private notify(): void {
        if (!this.disposed) {
            this.onChange(this.state);
        }
    }
}

export function orderConnectorInputs(inputs: readonly ConnectorTriggerInputDefinition[]): ConnectorTriggerInputDefinition[] {
    const visible = inputs.filter(input => input.visibility !== 'hidden');
    const dependencies = new Set(visible.flatMap(input => input.dynamic?.dependsOn ?? []));
    const pending = [...visible];
    pending.sort((left, right) => inputPriority(left) - inputPriority(right));
    const names = new Set(pending.map(input => input.name));
    if (names.size !== pending.length || [...dependencies].some(name => !names.has(name))) {
        throw new Error(localize('invalidConnectorParameterDependencies', 'The connector parameter definitions contain missing or duplicate dependencies. Check the selected event metadata before retrying F5.'));
    }
    const result: ConnectorTriggerInputDefinition[] = [];
    while (pending.length) {
        const index = pending.findIndex(input =>
            (input.dynamic?.dependsOn ?? []).every(name => !names.has(name)));
        if (index < 0) {
            throw new Error(localize('connectorParameterDependencyCycle', 'The connector parameter definitions contain a dependency cycle. Check the selected event metadata before retrying F5.'));
        }
        const [input] = pending.splice(index, 1);
        names.delete(input.name);
        result.push(input);
    }
    return result;
}

export function validateConnectorParameterText(value: string, input: ConnectorTriggerInputDefinition): string | undefined {
    if (!value.trim()) {
        return input.required ? requiredValue() : undefined;
    }
    if (input.type === 'integer' && !Number.isInteger(Number(value))) {
        return localize('connectorParameterInteger', 'Enter a whole number.');
    }
    if (input.type === 'number' && !Number.isFinite(Number(value))) {
        return localize('connectorParameterNumber', 'Enter a number.');
    }
    if (input.type === 'array' || input.type === 'object') {
        try {
            const parsed: unknown = JSON.parse(value);
            if (input.type === 'array' ? !Array.isArray(parsed) :
                typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                return localize('connectorParameterJsonShape', 'Enter a valid JSON {0}.', input.type);
            }
        } catch {
            return localize('connectorParameterJson', 'Enter valid JSON.');
        }
    }
    return undefined;
}

function requiredValue(): string {
    return localize('connectorParameterRequired', 'A value is required.');
}

function invalidSelection(): string {
    return localize('connectorParameterInvalidSelection', 'Select a current value returned by the connector.');
}

function inputPriority(input: ConnectorTriggerInputDefinition): number {
    return input.required ? 0 : input.visibility === 'important' ? 1 : input.dynamic ? 2 : 3;
}

function maskValue(context: IActionContext, value: ConnectorTriggerParameterValue): void {
    addValuesToMask(context, typeof value === 'string' ? value : JSON.stringify(value));
    if (value && typeof value === 'object') {
        for (const nested of Object.values(value)) {
            maskValue(context, nested);
        }
    }
}
