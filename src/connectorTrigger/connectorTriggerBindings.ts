/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import { localize } from '../localize';
import { parseJson } from '../utils/parseJson';
import { isRecord, readString } from './connectorTriggerUtils';

const excludedFolders = '**/{.git,node_modules,.venv,venv,bin,obj,dist,out}/**';
// The Functions host only loads function.json from immediate child folders of the project root.
const functionJsonGlob = '*/function.json';
const connectorSourceGlob = '**/*.{cs,py,js,ts}';
const connectorCallPattern = /\b(?:(?:app\.)?connectorTrigger(?:<[^()\r\n]+>)?|connectors(?:\.[A-Za-z_$][\w$]*){2})\s*\(\s*["']([^"']+)["']\s*,\s*/gid;
const structuralTokenPattern = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|[{}()[\],]/g;
const pythonTokenPattern = /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\r\n]*/g;

export interface ConnectorTriggerBindingCandidate {
    connectionSettingName: string;
    functionName?: string;
    triggerConfigSettingName: string;
}

interface PollingConnectorSourceBinding {
    binding: ConnectorTriggerBindingCandidate;
    index: number;
}

export async function findConnectorTriggerRegistrations(
    projectPath: string,
): Promise<string[]> {
    return await findRegistrations(
        projectPath,
        getConnectorTriggerRegistrationCountFromFunctionJson,
        getConnectorTriggerRegistrations,
    );
}

export async function findWebhookConnectorRegistrations(projectPath: string): Promise<string[]> {
    return await findRegistrations(projectPath, data => {
        if (!isRecord(data) || !Array.isArray(data.bindings)) {
            return 0;
        }
        return data.bindings.filter(binding => isRecord(binding) &&
            equalsIgnoreCase(readString(binding.type), 'connectorTrigger') &&
            (binding.deliveryMode === undefined || equalsIgnoreCase(readString(binding.deliveryMode), 'Webhook'))).length;
    }, getWebhookConnectorRegistrations);
}

export function getWebhookConnectorRegistrations(content: string, extension: string): string[] {
    const source = getSourceViews(content, extension);
    return [
        ...getAttributedConnectorBlocks(source)
            .filter(({ options }) => !/delivery_?mode\s*=/i.test(options) ||
                /delivery_?mode\s*=\s*(?:(?:\w+\.)*Webhook\b|["']Webhook["'])/i.test(options))
            .map(block => block.functionName),
        ...getTypeScriptRegistrations(source)
            .filter(({ properties }) => !properties.has('deliveryMode') ||
                equalsIgnoreCase(properties.get('deliveryMode'), 'Webhook'))
            .map(registration => registration.functionName),
    ];
}

export async function findNonPollingFunctionRegistrations(
    projectPath: string,
): Promise<string[]> {
    return await findRegistrations(
        projectPath,
        data => getPollingConnectorBindingsFromFunctionJson(data).length === 0 ? 1 : 0,
        getNonPollingFunctionRegistrations,
    );
}

async function findRegistrations(
    projectPath: string,
    getFunctionJsonCount: (data: unknown) => number,
    getSourceRegistrations: (content: string, extension: string) => string[],
): Promise<string[]> {
    const registrations: string[] = [];
    const functionJsonFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(projectPath, functionJsonGlob),
        excludedFolders,
    );
    for (const file of functionJsonFiles) {
        const data = await tryReadFunctionJson(file.fsPath);
        const count = getFunctionJsonCount(data);
        for (let index = 0; index < count; index++) {
            registrations.push(path.basename(path.dirname(file.fsPath)));
        }
    }

    const sourceFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(projectPath, connectorSourceGlob),
        excludedFolders,
    );
    for (const file of sourceFiles) {
        const content = (await AzExtFsExtra.readFile(file.fsPath)).toString();
        registrations.push(...getSourceRegistrations(content, path.extname(file.fsPath).toLowerCase()));
    }
    return registrations;
}

export async function findPollingConnectorBindings(
    projectPath: string,
): Promise<ConnectorTriggerBindingCandidate[]> {
    const candidates: ConnectorTriggerBindingCandidate[] = [];
    const functionJsonFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(projectPath, functionJsonGlob),
        excludedFolders,
    );
    for (const file of functionJsonFiles) {
        const data = await tryReadFunctionJson(file.fsPath);
        candidates.push(...getPollingConnectorBindingsFromFunctionJson(
            data,
            path.basename(path.dirname(file.fsPath)),
        ));
    }

    const sourceFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(projectPath, connectorSourceGlob),
        excludedFolders,
    );
    for (const file of sourceFiles) {
        candidates.push(...getPollingConnectorBindings(
            (await AzExtFsExtra.readFile(file.fsPath)).toString(),
            path.extname(file.fsPath).toLowerCase(),
        ));
    }
    return deduplicateBindings(candidates);
}

async function tryReadFunctionJson(filePath: string): Promise<unknown> {
    try {
        return parseJson((await AzExtFsExtra.readFile(filePath)).toString());
    } catch {
        // A function.json the host can't parse has no usable bindings; don't block unrelated F5 setup on it.
        return undefined;
    }
}

export function getConnectorTriggerRegistrations(content: string, extension?: string): string[] {
    const source = getSourceViews(content, extension);
    return [
        ...getAttributedConnectorBlocks(source).map(block => block.functionName),
        ...getRegistrationNames(
            source,
            /\b(?:(?:app\.)?connectorTrigger(?:<[^()\r\n]+>)?|connectors(?:\.[A-Za-z_$][\w$]*){2})\s*\(\s*["']([^"']+)["']/gid,
        ),
        ...getLoopConnectorCalls(source).map(call => call.functionName),
    ];
}

/**
 * Whether a Functions host setting such as `AzureWebJobs.<function>.Disabled` disables the function.
 */
export function isFunctionDisabledSettingValue(value: unknown): boolean {
    const text = typeof value === 'string' ? value : typeof value === 'boolean' || typeof value === 'number' ? String(value) : '';
    return text === '1' || equalsIgnoreCase(text, 'true');
}

export function getFunctionDisabledSettingName(functionName: string): string {
    return `AzureWebJobs.${functionName}.Disabled`;
}

/**
 * Removes bindings disabled by either host setting name.
 * @param getSettingValue Returns the effective value using case-insensitive setting names.
 */
export function filterEnabledConnectorBindings<T extends { functionName?: string }>(
    bindings: readonly T[],
    getSettingValue: (name: string) => unknown,
): T[] {
    return bindings.filter(binding => !binding.functionName || ![
        getFunctionDisabledSettingName(binding.functionName),
        `AzureWebJobs_${binding.functionName}_Disabled`,
    ].some(name => isFunctionDisabledSettingValue(getSettingValue(name))));
}

export function getPollingConnectorBindingsFromFunctionJson(
    data: unknown,
    functionName?: string,
): ConnectorTriggerBindingCandidate[] {
    if (!isRecord(data) || !Array.isArray(data.bindings)) {
        return [];
    }

    return data.bindings.flatMap(bindingValue => {
        const binding = isRecord(bindingValue) ? bindingValue : undefined;
        if (!binding ||
            !equalsIgnoreCase(readString(binding.type), 'connectorTrigger') ||
            !equalsIgnoreCase(readString(binding.deliveryMode), 'Poll')) {
            return [];
        }
        return createBindingCandidate(
            readString(binding.connection),
            readString(binding.triggerConfigName),
            functionName,
        );
    });
}

/**
 * @param extension Source file extension. When provided, registrations inside comments and string literals are ignored.
 */
export function getPollingConnectorBindings(
    content: string,
    extension?: string,
): ConnectorTriggerBindingCandidate[] {
    return getPollingConnectorSourceBindings(content, extension).map(candidate => candidate.binding);
}

function getPollingConnectorSourceBindings(content: string, extension?: string): PollingConnectorSourceBinding[] {
    const source = getSourceViews(content, extension);
    return [
        ...getAttributedConnectorBlocks(source).flatMap(({ functionName, options, index }) => {
            if (!/delivery_?mode\s*=\s*(?:\w+\.)*Poll\b/i.test(options)) {
                return [];
            }
            return createBindingCandidate(
                /connection\s*=\s*["']([^"']+)["']/i.exec(options)?.[1],
                /trigger_?config_?name\s*=\s*["']([^"']+)["']/i.exec(options)?.[1],
                functionName,
            ).map(binding => ({ binding, index }));
        }),
        ...getTypeScriptBindings(source),
    ];
}

interface SourceViews {
    /**
     * Source with comments blanked; string literals intact. Used to read option values.
     */
    text: string;
    /**
     * Source with comments and string-literal contents blanked, keeping delimiters and offsets. Used to find live code.
     */
    structure: string;
}

export function getSourceViews(content: string, extension: string | undefined): SourceViews {
    if (extension === undefined) {
        return { text: content, structure: content };
    }
    const pattern = extension === '.py' ? pythonTokenPattern : structuralTokenPattern;
    const blank = (token: string, fill: string) => token.replace(/[^\r\n]/g, fill);
    const isComment = (token: string) => token.startsWith('#') || token.startsWith('//') || token.startsWith('/*');
    return {
        text: content.replace(pattern, token => isComment(token) ? blank(token, ' ') : token),
        structure: content.replace(pattern, token => {
            if (isComment(token)) {
                return blank(token, ' ');
            }
            if (/^["'`]/.test(token)) {
                const delimiter = /^(?:"{3}|'{3})/.exec(token)?.[0] ?? token[0];
                const inner = token.slice(delimiter.length, token.length - delimiter.length);
                return delimiter + blank(inner, '_') + delimiter;
            }
            return token;
        }),
    };
}

// Reads a capture group matched against `structure` from the comment-free source text.
export function readGroup(source: SourceViews, match: RegExpMatchArray, group: number): string | undefined {
    const range = match.indices?.[group];
    return range ? source.text.slice(range[0], range[1]) : undefined;
}

function getConnectorTriggerRegistrationCountFromFunctionJson(data: unknown): number {
    if (!isRecord(data) || !Array.isArray(data.bindings)) {
        return 0;
    }
    return data.bindings.filter(bindingValue => {
        const binding = isRecord(bindingValue) ? bindingValue : undefined;
        return binding &&
            equalsIgnoreCase(readString(binding.type), 'connectorTrigger');
    }).length;
}

function getRegistrationNames(source: SourceViews, pattern: RegExp): string[] {
    return [...source.structure.matchAll(pattern)].flatMap(match => readGroup(source, match, 1) ?? []);
}

export function getNonPollingFunctionRegistrations(content: string, extension: string): string[] {
    const pollingIndexes = new Set(getPollingConnectorSourceBindings(content, extension).map(candidate => candidate.index));
    return getFunctionRegistrations(content, extension)
        .filter(registration => !pollingIndexes.has(registration.index))
        .map(registration => registration.functionName);
}

function getFunctionRegistrations(
    content: string,
    extension: string,
): { functionName: string; index: number }[] {
    // Mask literals/comments without moving declaration offsets.
    const code = content.replace(
        extension === '.py' ? pythonTokenPattern : structuralTokenPattern,
        token => /^["'`#\/]/.test(token) ? token.replace(/[^\r\n]/g, ' ') : token,
    );
    if (extension === '.py') {
        return [...code.matchAll(/^[ \t]*@[\s\S]*?^[ \t]*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm)]
            .flatMap(block => {
                const decorator = /@(?:\w+\.)?function_name\s*\(/.exec(block[0]);
                const functionName = decorator
                    ? readFunctionNameArgument(content.slice(block.index + decorator.index + decorator[0].length))
                    : /@(?:\w+\.)?(?:route|schedule|\w+_trigger)\s*\(/.test(block[0]) ? block[1] : undefined;
                return functionName ? [{ functionName, index: block.index }] : [];
            });
    }

    const declarationPattern = extension === '.cs'
        ? /\[\s*(?:\w+\.)*(?:Function|FunctionName)(?:Attribute)?\s*\(/g
        : /\b(?:app\.[A-Za-z_$][\w$]*(?:<[^()\r\n]+>)?|connectorTrigger(?:<[^()\r\n]+>)?|connectors(?:\.[A-Za-z_$][\w$]*){2})\s*\(/g;
    return [...code.matchAll(declarationPattern)].flatMap(match => {
        const argument = content.slice(match.index + match[0].length);
        const functionName = readFunctionNameArgument(argument) ??
            (extension === '.cs' ? /^\s*nameof\(\s*(?:\w+\.)*(\w+)\s*\)/.exec(argument)?.[1] : undefined);
        return functionName ? [{ functionName, index: match.index }] : [];
    });
}

function readFunctionNameArgument(content: string): string | undefined {
    return /^\s*(?:name\s*[=:]\s*)?["'`]([^"'`\r\n]+)["'`]/.exec(content)?.[1];
}

function getAttributedConnectorBlocks(source: SourceViews): { functionName: string; options: string; index: number }[] {
    const blocks: { functionName: string; options: string; index: number }[] = [];
    // Stop at the method body (including expression bodies), never at a later function's trigger.
    for (const match of source.structure.matchAll(/\[Function\(\s*["']([^"']+)["']\s*\)\]((?:(?!=>|\[Function\s*\()[^{])*?)(?=\{|=>)/gid)) {
        const functionName = readGroup(source, match, 1);
        // Webhook delivery uses a bare [ConnectorTrigger] attribute with no options.
        const options = readNestedGroup(source, match, 2, /\[\s*ConnectorTrigger\s*\(([\s\S]*?)\)\s*\]/id) ??
            readNestedGroup(source, match, 2, /\[\s*ConnectorTrigger\s*(\s*)\]/id);
        if (functionName && options !== undefined) {
            blocks.push({ functionName, options, index: match.index });
        }
    }
    for (const match of source.structure.matchAll(/^[ \t]*@[\s\S]*?(?=^[ \t]*(?:async\s+)?def\b)/gmd)) {
        const functionName = readNestedGroup(source, match, 0, /@(?:\w+\.)?function_name\s*\(\s*name\s*=\s*["']([^"']+)["']\s*\)/id);
        const options = readNestedGroup(source, match, 0, /@(?:\w+\.)?connector_trigger\s*\(([\s\S]*?)\)\s*(?:\r?\n)/id);
        if (functionName && options) {
            blocks.push({ functionName, options, index: match.index });
        }
    }
    return blocks;
}

// Matches `pattern` within an outer capture group of `structure`, returning its first capture from the source text.
function readNestedGroup(source: SourceViews, outer: RegExpMatchArray, outerGroup: number, pattern: RegExp): string | undefined {
    const range = outer.indices?.[outerGroup];
    if (!range) {
        return undefined;
    }
    const innerRange = pattern.exec(source.structure.slice(range[0], range[1]))?.indices?.[1];
    return innerRange ? source.text.slice(range[0] + innerRange[0], range[0] + innerRange[1]) : undefined;
}

function getTypeScriptBindings(
    source: SourceViews,
): PollingConnectorSourceBinding[] {
    return getTypeScriptRegistrations(source).flatMap(({ functionName, properties, index }) =>
        equalsIgnoreCase(properties.get('deliveryMode'), 'Poll') ? createBindingCandidate(
            properties.get('connection'),
            properties.get('triggerConfigName'),
            functionName,
        ).map(binding => ({ binding, index })) : []);
}

function getTypeScriptRegistrations(
    source: SourceViews,
): { functionName: string; properties: Map<string, string>; index: number }[] {
    const content = source.text;
    const namedOptions = new Map<string, string>();
    for (const match of source.structure.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?=\{)/gi)) {
        const options = readOptionsObject(content.slice(match.index + match[0].length));
        if (options !== undefined) {
            namedOptions.set(match[1], options);
        }
    }

    const registrations: { functionName: string; properties: Map<string, string>; index: number }[] = [];
    for (const match of source.structure.matchAll(connectorCallPattern)) {
        const functionName = readGroup(source, match, 1);
        const argument = content.slice(match.index + match[0].length);
        const name = /^([A-Za-z_$][\w$]*)\s*,?\s*\)/.exec(argument)?.[1];
        const options = name ? namedOptions.get(name) : readOptionsObject(argument);
        if (options === undefined || !functionName) {
            continue;
        }
        registrations.push({ functionName, properties: readConnectorProperties(options), index: match.index });
    }
    for (const call of getLoopConnectorCalls(source)) {
        registrations.push({ functionName: call.functionName, properties: readConnectorProperties(call.options), index: call.index });
    }
    return registrations;
}

function readConnectorProperties(options: string): Map<string, string> {
    return new Map(splitTopLevelProperties(options).flatMap(property => {
        const withoutComments = property.replace(structuralTokenPattern,
            token => token.startsWith('//') || token.startsWith('/*') ? ' ' : token);
        const value = /^\s*(?:([A-Za-z_$][\w$]*)|["']([^"']+)["'])\s*:\s*(?:(["'`])(.*?)\3|(?:[A-Za-z_$][\w$]*\.)+([A-Za-z_$][\w$]*))\s*$/.exec(withoutComments);
        const key = value?.[1] ?? value?.[2];
        // Only delivery mode accepts an enum member such as DeliveryMode.Poll; unresolved template substitutions are not static values.
        if (!value || !key || (value[5] !== undefined && key !== 'deliveryMode') || (value[3] === '`' && value[4].includes('${'))) {
            return [];
        }
        return [[key, value[4] ?? value[5]] as const];
    }));
}

interface ConnectorLoopCall {
    functionName: string;
    /**
     * Options object text with the loop's name variable substituted into template literals.
     */
    options: string;
    index: number;
}

/**
 * Expands statically known `for...of` loops that register one connector trigger per function name, such as
 * `for (const [name, register] of [['Fn', connectors.x.onY], ...] as const) { register(name, { ... }) }`
 * or `for (const name of ['Fn', ...]) { app.connectorTrigger(name, { ... }) }`.
 */
function getLoopConnectorCalls(source: SourceViews): ConnectorLoopCall[] {
    const { text, structure } = source;
    const scopes = [{ start: 0, end: text.length }];
    const stack = [scopes[0]];
    for (const token of getStructuralTokens(structure)) {
        if (token[0] === '{') {
            const scope = { start: token.index, end: text.length };
            scopes.push(scope);
            stack.push(scope);
        } else if (token[0] === '}' && stack.length > 1) {
            const scope = stack.pop();
            if (scope) {
                scope.end = token.index;
            }
        }
    }
    const declarations: { name: string; index: number; scope?: { start: number; end: number }; array?: string }[] =
        [...structure.matchAll(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g)].map(match => ({
            name: match[2],
            index: match.index,
            scope: scopes.filter(scope => scope.start <= match.index && scope.end >= match.index).at(-1),
            array: match[1] === 'const' && text[match.index + match[0].length] === '['
                ? readBalanced(text.slice(match.index + match[0].length))?.inner
                : undefined,
        }));
    // Parameters (and catch/for bindings) shadow outer arrays for the whole following block.
    for (const scope of scopes.slice(1)) {
        for (const name of getBlockParameterNames(structure, scope.start)) {
            declarations.push({ name, index: scope.start, scope });
        }
    }

    const calls: ConnectorLoopCall[] = [];
    const loopPattern = /\bfor\s*\(\s*(?:const|let|var)\s+(?:([A-Za-z_$][\w$]*)|\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\])\s+of\s+/g;
    for (const match of structure.matchAll(loopPattern)) {
        const nameVariable = match[1] ?? match[2];
        const registerVariable = match[3] as string | undefined;
        let offset = match.index + match[0].length;
        let elements: string | undefined;
        let dynamicArray = false;
        const inlineArray = readBalanced(text.slice(offset));
        if (inlineArray && text[offset] === '[') {
            elements = inlineArray.inner;
            offset += inlineArray.end;
            offset += /^\s*(?:as\s+const\s*)?/.exec(text.slice(offset))?.[0].length ?? 0;
        } else {
            const identifier = /^([A-Za-z_$][\w$]*)\s*/.exec(text.slice(offset));
            const declaration = identifier ? declarations
                .filter(candidate => candidate.name === identifier[1] && candidate.scope &&
                    candidate.scope.start <= match.index && candidate.scope.end >= match.index)
                .sort((a, b) => (b.scope?.start ?? 0) - (a.scope?.start ?? 0))[0] : undefined;
            elements = declaration && declaration.index < match.index ? declaration.array : undefined;
            // A visible binding that is not a static const array (parameter, mutable or computed value) cannot be enumerated.
            dynamicArray = declaration !== undefined && elements === undefined;
            offset += identifier?.[0].length ?? 0;
        }
        const close = /^\)\s*/.exec(text.slice(offset));
        if ((elements === undefined && !dynamicArray) || !close) {
            continue;
        }
        offset += close[0].length;
        const body = text[offset] === '{' ? readBalanced(text.slice(offset)) : undefined;
        if (!body) {
            continue;
        }
        if (elements === undefined) {
            const callee = new RegExp(`(?:\\b(?:app\\.)?connectorTrigger(?:<[^()\\r\\n]+>)?|connectors(?:\\.[A-Za-z_$][\\w$]*){2})\\s*\\(\\s*${escapeIdentifier(nameVariable)}\\s*,`);
            if (callee.test(structure.slice(offset + 1, offset + 1 + body.inner.length))) {
                throw unsupportedLoop();
            }
            continue;
        }
        const registrations = splitTopLevelProperties(elements).flatMap(element => {
            const value = element.trim();
            if (!value) {
                return [];
            }
            const literal = registerVariable ? /^\[\s*(["'`])([^"'`\\$\r\n]+)\1\s*,/.exec(value) : /^(["'`])([^"'`\\$\r\n]+)\1$/.exec(value);
            if (!literal) {
                return [];
            }
            const tuple = registerVariable ? readBalanced(value) : undefined;
            const registrar = tuple ? splitTopLevelProperties(tuple.inner)[1]?.trim() : undefined;
            const isConnectorRegistrar = registrar !== undefined &&
                /^(?:(?:app\.)?connectorTrigger|connectors(?:\.[A-Za-z_$][\w$]*){2})$/.test(registrar);
            return [{ functionName: literal[2], isConnectorRegistrar }];
        });

        const bodyStart = offset + 1;
        const bodyStructure = structure.slice(bodyStart, bodyStart + body.inner.length);
        const callees = [
            '\\b(?:app\\.)?connectorTrigger(?:<[^()\\r\\n]+>)?',
            'connectors(?:\\.[A-Za-z_$][\\w$]*){2}',
            ...(registerVariable ? [`(?<![\\w$.])${escapeIdentifier(registerVariable)}`] : []),
        ];
        const callPattern = new RegExp(`(${callees.join('|')})\\s*\\(\\s*${escapeIdentifier(nameVariable)}\\s*,\\s*(?=\\{)`, 'g');
        const loopCalls = [...bodyStructure.matchAll(callPattern)];
        if (!loopCalls.length) {
            continue;
        }
        for (const { functionName, isConnectorRegistrar } of registrations) {
            if (!isConnectorRegistrar && registerVariable &&
                loopCalls.every(call => call[1].replace(/<[^()]*>$/, '') === registerVariable)) {
                continue;
            }
            const reached = getReachedLoopCalls(body.inner, nameVariable, functionName, loopCalls);
            for (const call of loopCalls.filter(candidate => reached.indexes.has(candidate.index))) {
                const callIndex = bodyStart + call.index;
                const options = readOptionsObject(text.slice(callIndex + call[0].length));
                const isTupleCall = registerVariable !== undefined && call[1].replace(/<[^()]*>$/, '') === registerVariable;
                if (options === undefined || (isTupleCall && !isConnectorRegistrar)) {
                    continue;
                }
                // An odd number of preceding backslashes escapes the interpolation.
                const substitution = new RegExp(`(?<!\\\\)((?:\\\\\\\\)*)\\$\\{\\s*${escapeIdentifier(nameVariable)}\\s*\\}`, 'g');
                calls.push({
                    functionName,
                    options: options.replace(structuralTokenPattern, token => token.startsWith('`')
                        ? token.replace(substitution, (_match, backslashes: string) => `${backslashes}${functionName}`)
                        : token),
                    index: callIndex,
                });
            }
            if (reached.breakLoop) {
                break;
            }
        }
    }
    return calls;
}

function unsupportedLoop(): Error {
    return new Error(localize('connectorLoopControlFlow', 'Cannot determine Connector Trigger registrations in a loop with dynamic control flow. Use literal function names or unconditional registrations in the loop.'));
}

/**
 * Follows blocks, static name comparisons, and loop exits without executing project code.
 * Other control flow affecting registrations must fail explicitly instead of inventing or losing events.
 */
function getReachedLoopCalls(
    content: string,
    nameVariable: string,
    functionName: string,
    calls: readonly RegExpMatchArray[],
): { indexes: Set<number>; breakLoop: boolean } {
    const indexes = new Set<number>();
    type Control = 'continue' | 'break' | undefined;
    function statement(start: number, active: boolean): { end: number; control?: Control } {
        start += /^\s*/.exec(content.slice(start))?.[0].length ?? 0;
        if (content[start] === '{') {
            const block = readBalanced(content.slice(start));
            if (!block) {
                throw unsupportedLoop();
            }
            const end = start + block.end;
            let control: Control;
            for (let cursor = start + 1; cursor < end - 1;) {
                const next = statement(cursor, active && !control);
                control ??= next.control;
                if (next.end <= cursor) {
                    break;
                }
                cursor = next.end;
            }
            return { end, control };
        }
        const conditionStart = /^if\b\s*/.exec(content.slice(start));
        if (conditionStart) {
            const condition = readBalanced(content.slice(start + conditionStart[0].length));
            if (!condition) {
                throw unsupportedLoop();
            }
            const value = active ? evaluateLoopCondition(condition.inner, nameVariable, functionName) : false;
            const branchStart = start + conditionStart[0].length + condition.end;
            const then = statement(branchStart, active && value === true);
            const otherwise = /^\s*else\b\s*/.exec(content.slice(then.end));
            const alternative = otherwise ? statement(then.end + otherwise[0].length, active && value === false) : undefined;
            const end = alternative?.end ?? then.end;
            if (active && value === undefined && affectsRegistrations(content.slice(branchStart, end), branchStart, end)) {
                throw unsupportedLoop();
            }
            return { end, control: then.control ?? alternative?.control };
        }
        let depth = 0;
        let end = content.length;
        for (const token of content.slice(start).matchAll(new RegExp(`${structuralTokenPattern.source}|;`, 'g'))) {
            if (/^[{([]$/.test(token[0])) {
                depth++;
            } else if (/^[})\]]$/.test(token[0])) {
                if (depth === 0) {
                    end = start + token.index;
                    break;
                }
                depth--;
            } else if (token[0] === ';' && depth === 0) {
                end = start + token.index + 1;
                break;
            }
        }
        const expression = content.slice(start, end).trim();
        if (!active) {
            return { end };
        }
        if (/^(continue|break)\s*;?$/.test(expression)) {
            return { end, control: expression.startsWith('continue') ? 'continue' : 'break' };
        }
        const contained = calls.filter(call => call.index !== undefined && call.index >= start && call.index < end);
        if (contained.length) {
            // Only a direct registration expression is unconditional. Logical/ternary calls and nested
            // functions/loops need evaluation we cannot safely perform.
            const call = contained[0];
            const invocationStart = call.index ?? start;
            const open = content.indexOf('(', invocationStart);
            const invocation = readBalanced(content.slice(open));
            if (contained.length !== 1 || invocationStart !== start || !invocation ||
                !/^\s*;?\s*$/.test(content.slice(open + invocation.end, end))) {
                throw unsupportedLoop();
            }
            indexes.add(invocationStart);
        } else {
            const structure = getSourceViews(expression, '.ts').structure;
            if (new RegExp(`\\b${escapeIdentifier(nameVariable)}\\s*(?:=(?!=)|\\+=|-=|\\+\\+|--)`).test(structure) ||
                /\b(?:continue|break|return|throw)\b/.test(structure)) {
                throw unsupportedLoop();
            }
        }
        return { end };
    }
    function affectsRegistrations(expression: string, start: number, end: number): boolean {
        return calls.some(call => call.index !== undefined && call.index >= start && call.index < end) ||
            /\b(?:continue|break|return|throw)\b/.test(getSourceViews(expression, '.ts').structure);
    }
    let control: Control;
    for (let cursor = 0; cursor < content.length && !control;) {
        const next = statement(cursor, true);
        control = next.control;
        if (next.end <= cursor) {
            break;
        }
        cursor = next.end;
    }
    return { indexes, breakLoop: control === 'break' };
}

function evaluateLoopCondition(condition: string, nameVariable: string, functionName: string): boolean | undefined {
    const expression = condition.trim();
    const bracket = readBalanced(expression);
    if (expression.startsWith('(') && bracket?.end === expression.length) {
        return evaluateLoopCondition(bracket.inner, nameVariable, functionName);
    }
    if (expression === 'true' || expression === 'false') {
        return expression === 'true';
    }
    const comparison = new RegExp(`^${escapeIdentifier(nameVariable)}\\s*(===|!==|==|!=)\\s*(["'])([^"'\\\\]*)\\2$`).exec(expression);
    if (comparison) {
        const equal = functionName === comparison[3];
        return comparison[1].startsWith('!') ? !equal : equal;
    }
    return undefined;
}

/**
 * Names bound by the parameter list or loop/catch header immediately preceding the block that opens at `blockStart`.
 */
function getBlockParameterNames(structure: string, blockStart: number): string[] {
    const prefix = structure.slice(0, blockStart);
    const arrow = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*=>\s*$/.exec(prefix);
    if (arrow) {
        return [arrow[1]];
    }
    const header = /\)\s*(?::[^{};()=]*)?\s*(?:=>\s*)?$/.exec(prefix);
    if (!header) {
        return [];
    }
    const close = header.index;
    let depth = 0;
    let open = -1;
    for (let i = close; i >= 0; i--) {
        if (prefix[i] === ')') {
            depth++;
        } else if (prefix[i] === '(' && --depth === 0) {
            open = i;
            break;
        }
    }
    if (open < 0) {
        return [];
    }
    const keyword = /([A-Za-z_$][\w$]*)\s*$/.exec(prefix.slice(0, open))?.[1];
    let bindings = prefix.slice(open + 1, close);
    if (keyword && /^(?:if|while|switch|with)$/.test(keyword)) {
        return [];
    } else if (keyword === 'for') {
        const loopBinding = /^\s*(?:const|let|var)\s+([\s\S]*?)\s*(?:\b(?:of|in)\b|=|;)/.exec(bindings);
        if (!loopBinding) {
            return [];
        }
        bindings = loopBinding[1];
    }
    // Drop default values and type annotations; object pattern keys (`key: binding`) are not bindings.
    return splitTopLevelProperties(bindings.replace(/=[^,]*/g, '')).flatMap(parameter =>
        [...parameter.replace(/^\s*(?:\.\.\.)?\s*([A-Za-z_$][\w$]*)\s*\??\s*:[\s\S]*$/, '$1')
            .matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)(?![\w$]|\s*:)/g)]
            .map(match => match[1])
            .filter(name => !/^(?:public|private|protected|readonly|override|this)$/.test(name)));
}

function escapeIdentifier(identifier: string): string {
    return identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Reads a bracketed expression at the start of `content`, skipping literals and comments.
function readBalanced(content: string): { inner: string; end: number } | undefined {
    if (!/^[{([]/.test(content)) {
        return undefined;
    }
    let depth = 0;
    for (const token of getStructuralTokens(content)) {
        if (/^[{([]$/.test(token[0])) {
            depth++;
        } else if (/^[})\]]$/.test(token[0]) && --depth === 0) {
            return { inner: content.slice(1, token.index), end: token.index + 1 };
        }
    }
    return undefined;
}

// Skip literals/comments and balance nested expressions so handlers cannot supply binding settings.
function getStructuralTokens(content: string): IterableIterator<RegExpExecArray> {
    return content.matchAll(structuralTokenPattern);
}

function readOptionsObject(content: string): string | undefined {
    if (!content.startsWith('{')) {
        return undefined;
    }
    let depth = 0;
    for (const token of getStructuralTokens(content)) {
        if (token[0] === '{') {
            depth++;
        } else if (token[0] === '}' && --depth === 0) {
            return content.slice(1, token.index);
        }
    }
    return undefined;
}

function splitTopLevelProperties(content: string): string[] {
    const properties: string[] = [];
    let depth = 0;
    let start = 0;
    for (const token of getStructuralTokens(content)) {
        if (/^[{([]$/.test(token[0])) {
            depth++;
        } else if (/^[})\]]$/.test(token[0])) {
            depth--;
        } else if (token[0] === ',' && depth === 0) {
            properties.push(content.slice(start, token.index));
            start = token.index + 1;
        }
    }
    properties.push(content.slice(start));
    return properties;
}

function createBindingCandidate(
    connectionSettingName: string | undefined,
    triggerConfigReference: string | undefined,
    functionName?: string,
): ConnectorTriggerBindingCandidate[] {
    const triggerConfigSettingName = parseSettingReference(triggerConfigReference);
    if (!connectionSettingName?.trim() || !triggerConfigSettingName) {
        return [];
    }
    return [{
        connectionSettingName: connectionSettingName.trim(),
        triggerConfigSettingName,
        ...(functionName?.trim() ? { functionName: functionName.trim() } : {}),
    }];
}

function parseSettingReference(value: string | undefined): string | undefined {
    const match = value?.trim().match(/^%([^%]+)%$/);
    return match?.[1]?.trim() || undefined;
}

function deduplicateBindings(
    candidates: readonly ConnectorTriggerBindingCandidate[],
): ConnectorTriggerBindingCandidate[] {
    const seen = new Set<string>();
    return candidates.filter(candidate => {
        const key = [
            candidate.functionName?.toLowerCase() ?? '',
            candidate.connectionSettingName.toLowerCase(),
            candidate.triggerConfigSettingName.toLowerCase(),
        ].join('\0');
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function equalsIgnoreCase(left: string | undefined, right: string): boolean {
    return typeof left === 'string' &&
        left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}
