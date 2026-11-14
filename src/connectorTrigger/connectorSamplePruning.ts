/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as jsonc from 'jsonc-parser';
import * as path from 'path';
import { FileType } from 'vscode';
import { getConnectorTriggerRegistrations } from './connectorTriggerBindings';

/**
 * Removes unselected sample functions from Python and C# sources, then removes the matching
 * Poll trigger entries from infra and local settings. Anything not safely recognizable is kept.
 * @returns the names of the functions that were removed
 */
export async function pruneConnectorSampleFunctions(
    projectPath: string, functionPaths: ReadonlyMap<string, string>, unselectedNames: Iterable<string>,
    triggerConfigSettingNames: ReadonlyMap<string, string>,
): Promise<Set<string>> {
    const filesToNames = new Map<string, string[]>();
    for (const name of unselectedNames) {
        const file = functionPaths.get(name);
        if (file) {
            filesToNames.set(file, [...filesToNames.get(file) ?? [], name]);
        }
    }
    const removed = new Set<string>();
    for (const [file, names] of filesToNames) {
        const extension = path.extname(file).toLowerCase();
        if (extension !== '.py' && extension !== '.cs') {
            continue;
        }
        const content = await AzExtFsExtra.readFile(file);
        const result = pruneSourceFunctions(content, extension, names);
        if (result.removed.length) {
            await AzExtFsExtra.writeFile(file, result.content);
            result.removed.forEach(name => removed.add(name));
        }
    }
    if (!removed.size) {
        return removed;
    }
    const infraPath = path.join(projectPath, 'infra');
    if (await AzExtFsExtra.pathExists(infraPath)) {
        for (const file of await findInfraFiles(infraPath)) {
            const content = await AzExtFsExtra.readFile(file);
            const pruned = path.extname(file).toLowerCase() === '.json' ? pruneJsonTriggerEntries(content, removed) : pruneBicepTriggerEntries(content, removed);
            if (pruned !== content) {
                await AzExtFsExtra.writeFile(file, pruned);
            }
        }
    }
    const settingNames = [...removed].flatMap(name => [
        triggerConfigSettingNames.get(name) ?? `${name}TriggerConfigName`, `AzureWebJobs.${name}.Disabled`]);
    for (const fileName of ['local.settings.json', 'local.settings.example.json']) {
        const file = path.join(projectPath, fileName);
        if (await AzExtFsExtra.pathExists(file)) {
            const content = await AzExtFsExtra.readFile(file);
            const pruned = pruneLocalSettingsValues(content, settingNames);
            if (pruned !== content) {
                await AzExtFsExtra.writeFile(file, pruned);
            }
        }
    }
    return removed;
}

export function pruneConnectorSampleDeploymentHook(content: string, extension: string, removedNames: ReadonlySet<string>): string {
    if (extension.toLowerCase() === '.py') {
        return prunePythonDeploymentHook(content, removedNames);
    }
    if (extension.toLowerCase() === '.ps1') {
        return prunePowerShellDeploymentHook(content, removedNames);
    }
    return content;
}

function prunePythonDeploymentHook(content: string, removedNames: ReadonlySet<string>): string {
    const operations = /(^OPERATIONS\s*=\s*\{\r?\n)([\s\S]*?)(^[ \t]*\})/m.exec(content);
    if (!operations) {
        return content;
    }
    let entries = operations[2];
    for (const name of removedNames) {
        const pattern = new RegExp(`^[ \\t]*["']${escapeRegExp(name)}["'][ \\t]*:[ \\t]*["'][^"'\\r\\n]+["'][ \\t]*,?[ \\t]*(?:\\r?\\n|$)`, 'm');
        entries = entries.replace(pattern, '');
    }
    const remaining = [...entries.matchAll(/^[ \t]*["']([A-Za-z_]\w*)["'][ \t]*:/gm)].map(match => match[1]);
    if (remaining.length === 0 || entries === operations[2]) {
        return content;
    }
    let result = content.slice(0, operations.index) + operations[1] + entries + operations[3] +
        content.slice(operations.index + operations[0].length);
    if (removedNames.has('OnSharedMailboxNewEmail')) {
        result = result.replace(
            /^[ \t]*f"AzureWebJobs\.\{SHARED_FUNCTION\}\.Disabled": str\(\r?\n[ \t]*not bool\(outputs\.get\("office365SharedMailboxAddress", ""\)\.strip\(\)\)\r?\n[ \t]*\)\.lower\(\),\r?\n/m,
            '',
        );
        result = result.replace(
            /(^[ \t]*)if options\.mode == "polling":(\r?\n)([ \t]+)disable_shared_poll\(outputs, collection, resources\)/m,
            (_match, indent: string, eol: string, childIndent: string) =>
                `${indent}if options.mode == "polling" and SHARED_FUNCTION in OPERATIONS:${eol}${childIndent}disable_shared_poll(outputs, collection, resources)`,
        );
    }
    return result;
}

function prunePowerShellDeploymentHook(content: string, removedNames: ReadonlySet<string>): string {
    const functions = /(foreach \(\$functionName in @\(\r?\n)([\s\S]*?)(\)\) \{)/m.exec(content);
    if (!functions) {
        return content;
    }
    const names = [...functions[2].matchAll(/'([^'\r\n]+)'/g)].map(match => match[1]);
    const remaining = names.filter(name => !removedNames.has(name));
    if (remaining.length === 0 || remaining.length === names.length) {
        return content;
    }
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const list = remaining.map((name, index) => `    '${name}'${index < remaining.length - 1 ? ',' : ''}`).join(eol);
    let result = content.slice(0, functions.index) + functions[1] + list + eol + functions[3] +
        content.slice(functions.index + functions[0].length);
    if (removedNames.has('OnSharedMailboxNewEmail')) {
        const sharedSetting = [
            "$localValues['AzureWebJobs.OnSharedMailboxNewEmail.Disabled'] =",
            "    ([string]::IsNullOrWhiteSpace($outputs.office365SharedMailboxAddress)).ToString().ToLowerInvariant()",
        ].join(eol) + eol;
        result = result.replace(sharedSetting, '');
        result = result.replace(
            'if ([string]::IsNullOrWhiteSpace($outputs.office365SharedMailboxAddress)) {',
            "if ($triggerSettings.PSObject.Properties.Name -contains 'OnSharedMailboxNewEmailTriggerConfigName' -and [string]::IsNullOrWhiteSpace($outputs.office365SharedMailboxAddress)) {",
        );
    }
    return result;
}

/**
 * Removes the named function registrations from a Python or C# source file. The result is only
 * accepted when exactly the removed registrations disappear; otherwise the source is returned unchanged.
 */
export function pruneSourceFunctions(content: string, extension: string, functionNames: string[]): { content: string; removed: string[] } {
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const trailingEol = content.endsWith('\n');
    let lines = content.split(/\r?\n/);
    if (trailingEol) {
        lines.pop();
    }
    const removed: string[] = [];
    for (const name of functionNames) {
        const range = extension === '.py' ? findPythonFunctionLines(lines, name) : findCSharpFunctionLines(lines, name);
        if (range) {
            lines = removeLines(lines, range[0], range[1]);
            removed.push(name);
        }
    }
    if (!removed.length) {
        return { content, removed };
    }
    const result = lines.join(eol) + (trailingEol ? eol : '');
    const before = getConnectorTriggerRegistrations(content, extension);
    const after = getConnectorTriggerRegistrations(result, extension);
    const expected = [...before];
    for (const name of removed) {
        const index = expected.indexOf(name);
        if (index < 0) {
            return { content, removed: [] };
        }
        expected.splice(index, 1);
    }
    if (after.length !== expected.length || after.some((name, index) => name !== expected[index])) {
        return { content, removed: [] };
    }
    return { content: result, removed };
}

function removeLines(lines: string[], start: number, end: number): string[] {
    const result = [...lines.slice(0, start), ...lines.slice(end + 1)];
    if (start < result.length && isBlank(result[start])) {
        let count = 0;
        while (start + count < result.length && isBlank(result[start + count])) {
            count++;
        }
        result.splice(start, count);
    } else {
        let first = start;
        while (first > 0 && isBlank(result[first - 1])) {
            first--;
        }
        result.splice(first, start - first);
    }
    return result;
}

function isBlank(line: string): boolean {
    return line.trim() === '';
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns whether each line starts outside brackets and strings, so module-level statements can be found.
 */
function getPythonTopLevelLines(lines: string[]): boolean[] {
    const topLevel: boolean[] = [];
    let depth = 0;
    let quote: string | undefined;
    for (const line of lines) {
        topLevel.push(depth === 0 && quote === undefined);
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (quote) {
                if (char === '\\') {
                    i++;
                } else if (line.startsWith(quote, i)) {
                    i += quote.length - 1;
                    quote = undefined;
                }
            } else if (char === '#') {
                break;
            } else if (char === '"' || char === "'") {
                quote = line.startsWith(char.repeat(3), i) ? char.repeat(3) : char;
                i += quote.length - 1;
            } else if ('([{'.includes(char)) {
                depth++;
            } else if (')]}'.includes(char)) {
                depth = Math.max(0, depth - 1);
            }
        }
        if (quote && quote.length === 1) {
            quote = undefined;
        }
    }
    return topLevel;
}

function findPythonFunctionLines(lines: string[], name: string): [number, number] | undefined {
    const topLevel = getPythonTopLevelLines(lines);
    const isStatement = (index: number) => topLevel[index] && /^[^\s#]/.test(lines[index]);
    const isColumnZeroComment = (index: number) => topLevel[index] && lines[index].startsWith('#');
    const pattern = new RegExp(`^@(?:\\w+\\.)?function_name\\s*\\(\\s*name\\s*=\\s*["']${escapeRegExp(name)}["']\\s*\\)`);
    const matches = lines.map((line, index) => isStatement(index) && pattern.test(line) ? index : -1).filter(index => index >= 0);
    if (matches.length !== 1) {
        return undefined;
    }
    let start = matches[0];
    for (let index = start - 1; index >= 0; index--) {
        if (!topLevel[index]) {
            continue;
        }
        if (isStatement(index) && lines[index].startsWith('@')) {
            start = index;
        } else {
            break;
        }
    }
    let definition = -1;
    for (let index = matches[0] + 1; index < lines.length; index++) {
        if (isStatement(index) && !lines[index].startsWith('@')) {
            definition = /^(?:async\s+)?def\s/.test(lines[index]) ? index : -1;
            break;
        }
    }
    if (definition < 0) {
        return undefined;
    }
    let end = lines.length - 1;
    for (let index = definition + 1; index < lines.length; index++) {
        if (isStatement(index)) {
            end = index - 1;
            break;
        }
    }
    while (end > definition && (isBlank(lines[end]) || isColumnZeroComment(end))) {
        end--;
    }
    while (start > 0 && isColumnZeroComment(start - 1)) {
        start--;
    }
    return [start, end];
}

function findCSharpFunctionLines(lines: string[], name: string): [number, number] | undefined {
    const content = lines.join('\n');
    const pattern = new RegExp(`\\[Function\\(\\s*"${escapeRegExp(name)}"\\s*\\)\\]`, 'g');
    const matches = [...content.matchAll(pattern)];
    if (matches.length !== 1 || matches[0].index === undefined) {
        return undefined;
    }
    const attributeStart = matches[0].index;
    const end = findCSharpMemberEnd(content, attributeStart + matches[0][0].length);
    if (end === undefined || content.slice(end, content.indexOf('\n', end) < 0 ? content.length : content.indexOf('\n', end)).trim()) {
        return undefined;
    }
    const lineOf = (offset: number) => content.slice(0, offset).split('\n').length - 1;
    let start = lineOf(attributeStart);
    if (lines[start].slice(0, attributeStart - content.lastIndexOf('\n', attributeStart - 1) - 1).trim()) {
        return undefined;
    }
    while (start > 0 && /^\s*(?:\/\/|\[[^\]]*\]\s*$)/.test(lines[start - 1])) {
        start--;
    }
    return [start, lineOf(end - 1)];
}

/**
 * Finds the end offset of the member that follows a C# attribute: its block body or expression body.
 */
function findCSharpMemberEnd(content: string, offset: number): number | undefined {
    let depth = 0;
    let braces = 0;
    let expressionBody = false;
    for (let i = offset; i < content.length; i++) {
        const char = content[i];
        const skipped = skipCSharpTrivia(content, i);
        if (skipped !== i) {
            i = skipped - 1;
            continue;
        }
        if (char === '(' || char === '[') {
            depth++;
        } else if (char === ')' || char === ']') {
            depth--;
        } else if (depth === 0 && char === '{') {
            braces++;
        } else if (depth === 0 && char === '}') {
            braces--;
            if (braces < 0) {
                return undefined;
            }
            if (braces === 0 && !expressionBody) {
                return i + 1;
            }
        } else if (depth === 0 && braces === 0 && char === '=' && content[i + 1] === '>') {
            expressionBody = true;
            i++;
        } else if (depth === 0 && braces === 0 && char === ';') {
            return expressionBody ? i + 1 : undefined;
        }
    }
    return undefined;
}

function skipCSharpTrivia(content: string, i: number): number {
    if (content.startsWith('//', i)) {
        const end = content.indexOf('\n', i);
        return end < 0 ? content.length : end;
    }
    if (content.startsWith('/*', i)) {
        const end = content.indexOf('*/', i + 2);
        return end < 0 ? content.length : end + 2;
    }
    const verbatim = /^(?:\$@|@\$|@)"/.exec(content.slice(i, i + 3));
    if (verbatim) {
        let j = i + verbatim[0].length;
        while (j < content.length) {
            if (content[j] === '"') {
                if (content[j + 1] === '"') {
                    j += 2;
                    continue;
                }
                return j + 1;
            }
            j++;
        }
        return content.length;
    }
    const quoteOffset = content[i] === '$' && content[i + 1] === '"' ? i + 1 : i;
    const quote = content[quoteOffset];
    if (quote === '"' || quote === "'") {
        let j = quoteOffset + 1;
        while (j < content.length && content[j] !== quote && content[j] !== '\n') {
            j += content[j] === '\\' ? 2 : 1;
        }
        return j + 1;
    }
    return i;
}

/**
 * Removes Bicep trigger entries whose literal `functionName` was removed. A standalone trigger is
 * removed only when its `activeTriggers` and settings-output references are both recognized.
 */
export function pruneBicepTriggerEntries(content: string, removedNames: ReadonlySet<string>): string {
    const tokens = [...content.matchAll(/'''[\s\S]*?'''|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|[A-Za-z_]\w*|\S/g)]
        .filter(token => !token[0].startsWith('//') && !token[0].startsWith('/*'));
    interface Container { char: string; offset: number; isElement: boolean; parent?: Container; variableName?: string; functionName?: string; functions: number; removable: { start: number; end: number }[] }
    interface TriggerVariable { name: string; functionName: string; start: number; end: number }
    const stack: Container[] = [];
    const arrays: Container[] = [];
    const triggerVariables: TriggerVariable[] = [];
    for (const [index, token] of tokens.entries()) {
        const value = token[0];
        const offset = token.index ?? 0;
        const parent = stack[stack.length - 1];
        if (value === '[' || value === '{') {
            const previous = tokens[index - 1]?.[0];
            const lineStart = content.lastIndexOf('\n', offset - 1) + 1;
            const declaration = parent ? undefined : /^\s*var\s+([A-Za-z_]\w*)\s*=\s*$/.exec(content.slice(lineStart, offset));
            stack.push({
                char: value, offset, parent, variableName: declaration?.[1],
                isElement: parent?.char === '[' && (previous === '[' || previous === '}'),
                functions: 0, removable: [],
            });
        } else if (value === ']' || value === '}') {
            const container = stack.pop();
            if (container?.char === '[') {
                arrays.push(container);
            } else if (container?.parent?.char === '[' && container.functionName !== undefined) {
                container.parent.functions++;
                if (container.isElement && removedNames.has(container.functionName)) {
                    container.parent.removable.push({ start: container.offset, end: offset + 1 });
                }
            } else if (container?.char === '{' && container.variableName && container.functionName) {
                triggerVariables.push({
                    name: container.variableName, functionName: container.functionName,
                    start: content.lastIndexOf('\n', container.offset - 1) + 1, end: offset + 1,
                });
            }
        } else if (parent?.char === '{' && (value === 'functionName' || value === "'functionName'") && tokens[index + 1]?.[0] === ':') {
            const literal = /^'([A-Za-z_][\w-]*)'$/.exec(tokens[index + 2]?.[0] ?? '');
            if (literal) {
                parent.functionName = literal[1];
            }
        }
    }
    let result = content;
    const fullyRemovedTriggers = arrays.some(array =>
        array.variableName === 'triggers' && array.functions > 0 && array.removable.length === array.functions);
    const optionalTrigger = triggerVariables.find(variable => !removedNames.has(variable.functionName) &&
        getOptionalTriggerExpressions(content, variable.name));
    if (fullyRemovedTriggers && optionalTrigger) {
        const expressions = getOptionalTriggerExpressions(content, optionalTrigger.name);
        const state = /state:\s*enableTriggers\s*\?\s*'Enabled'\s*:\s*'Disabled'/g;
        const states = [...content.matchAll(state)];
        if (expressions && states.length === 1) {
            const active = expressions.active[0];
            const activeExpression = new RegExp(
                `(var\\s+activeTriggers\\s*=\\s*)concat\\(\\s*triggers\\s*,\\s*empty\\(\\s*${escapeRegExp(active[2])}\\s*\\)\\s*\\?\\s*\\[\\s*\\]\\s*:\\s*\\[\\s*${escapeRegExp(optionalTrigger.name)}\\s*\\]\\s*\\)`,
            );
            result = result.replace(activeExpression, `$1concat(triggers, [${optionalTrigger.name}])`);
            result = result.replace(state, `state: enableTriggers && (trigger.functionName != '${optionalTrigger.functionName}' || !empty(${active[2]})) ? 'Enabled' : 'Disabled'`);
        } else {
            return content;
        }
    }
    const ranges = arrays.filter(array => array.removable.length < array.functions ||
        (array.variableName === 'triggers' && fullyRemovedTriggers && optionalTrigger)).flatMap(array => array.removable);
    for (const range of ranges.sort((left, right) => right.start - left.start)) {
        const lineStart = result.lastIndexOf('\n', range.start - 1) + 1;
        const newline = result.indexOf('\n', range.end);
        const lineEnd = newline < 0 ? result.length : newline + 1;
        if (result.slice(lineStart, range.start).trim() || result.slice(range.end, lineEnd).trim()) {
            continue;
        }
        result = result.slice(0, lineStart) + result.slice(lineEnd);
    }
    for (const variable of triggerVariables.filter(item => removedNames.has(item.functionName))) {
        result = pruneStandaloneTriggerVariable(result, variable.name);
    }
    return result;
}

function getOptionalTriggerExpressions(content: string, variableName: string): { active: RegExpMatchArray[]; output: RegExpMatchArray[] } | undefined {
    const escaped = escapeRegExp(variableName);
    const active = [...content.matchAll(new RegExp(
        `(var\\s+activeTriggers\\s*=\\s*)concat\\(\\s*triggers\\s*,\\s*empty\\(\\s*([A-Za-z_]\\w*)\\s*\\)\\s*\\?\\s*\\[\\s*\\]\\s*:\\s*\\[\\s*${escaped}\\s*\\]\\s*\\)`,
        'g',
    ))];
    const output = [...content.matchAll(new RegExp(`concat\\(\\s*triggers\\s*,\\s*\\[\\s*${escaped}\\s*\\]\\s*\\)`, 'g'))];
    return active.length === 1 && output.length === 1 ? { active, output } : undefined;
}

function pruneStandaloneTriggerVariable(content: string, variableName: string): string {
    const expressions = getOptionalTriggerExpressions(content, variableName);
    if (!expressions) {
        return content;
    }
    const tokens = [...content.matchAll(/'''[\s\S]*?'''|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|[A-Za-z_]\w*|\S/g)]
        .filter(token => !token[0].startsWith('//') && !token[0].startsWith('/*'));
    const variable = tokens.find(token => token[0] === variableName);
    if (!variable) {
        return content;
    }
    const definition = content.lastIndexOf('\n', variable.index ?? 0) + 1;
    const objectStart = content.indexOf('{', definition);
    if (objectStart < 0) {
        return content;
    }
    const references = tokens.filter(token => token[0] === variableName && (token.index ?? 0) > objectStart);
    if (references.length !== 2) {
        return content;
    }
    const activePattern = new RegExp(
        `(var\\s+activeTriggers\\s*=\\s*)concat\\(\\s*triggers\\s*,\\s*empty\\(\\s*[A-Za-z_]\\w*\\s*\\)\\s*\\?\\s*\\[\\s*\\]\\s*:\\s*\\[\\s*${escapeRegExp(variableName)}\\s*\\]\\s*\\)`,
    );
    let result = content.replace(activePattern, '$1triggers');
    result = result.replace(expressions.output[0][0], 'triggers');
    const objectStartAfter = result.indexOf('{', definition);
    const close = findBicepObjectEnd(result, objectStartAfter);
    if (close < 0) {
        return content;
    }
    const newline = result.indexOf('\n', close + 1);
    const end = newline < 0 ? result.length : newline + 1;
    return result.slice(0, definition) + result.slice(end);
}

function findBicepObjectEnd(content: string, start: number): number {
    const tokens = [...content.matchAll(/'''[\s\S]*?'''|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|[A-Za-z_]\w*|\S/g)]
        .filter(token => !token[0].startsWith('//') && !token[0].startsWith('/*'));
    let depth = 0;
    for (const token of tokens) {
        const offset = token.index ?? 0;
        if (offset < start) {
            continue;
        }
        if (token[0] === '{') {
            depth++;
        } else if (token[0] === '}' && --depth === 0) {
            return offset;
        }
    }
    return -1;
}

/**
 * Removes JSON array elements whose `functionName` was removed, keeping arrays that would become empty.
 */
export function pruneJsonTriggerEntries(content: string, removedNames: ReadonlySet<string>): string {
    const root = jsonc.parseTree(content);
    if (!root) {
        return content;
    }
    const paths: jsonc.JSONPath[] = [];
    const visit = (node: jsonc.Node) => {
        if (node.type === 'array') {
            const functions = (node.children ?? []).map(child => {
                const value = child.type === 'object' ? jsonc.findNodeAtLocation(child, ['functionName'])?.value as unknown : undefined;
                return typeof value === 'string' ? value : undefined;
            });
            const removable = functions.flatMap((name, index) => name !== undefined && removedNames.has(name) ? [index] : []);
            if (removable.length && removable.length < functions.filter(name => name !== undefined).length) {
                const arrayPath = jsonc.getNodePath(node);
                paths.push(...removable.reverse().map(index => [...arrayPath, index]));
            }
        }
        node.children?.forEach(visit);
    };
    visit(root);
    let result = content;
    for (const elementPath of paths) {
        result = jsonc.applyEdits(result, jsonc.modify(result, elementPath, undefined, { formattingOptions: getJsonFormatting(content) }));
    }
    return result;
}

function pruneLocalSettingsValues(content: string, settingNames: string[]): string {
    let result = content;
    const values = (jsonc.parse(content) as { Values?: unknown } | undefined)?.Values;
    if (!values || typeof values !== 'object') {
        return content;
    }
    for (const name of settingNames) {
        if (Object.prototype.hasOwnProperty.call(values, name)) {
            result = jsonc.applyEdits(result, jsonc.modify(result, ['Values', name], undefined, { formattingOptions: getJsonFormatting(content) }));
        }
    }
    return result;
}

function getJsonFormatting(content: string): jsonc.FormattingOptions {
    const indent = /\n([ \t]+)\S/.exec(content)?.[1] ?? '  ';
    return { insertSpaces: !indent.includes('\t'), tabSize: indent.includes('\t') ? 1 : indent.length, eol: content.includes('\r\n') ? '\r\n' : '\n' };
}

async function findInfraFiles(directory: string): Promise<string[]> {
    const files: string[] = [];
    for (const entry of await AzExtFsExtra.readDirectory(directory)) {
        const entryPath = path.join(directory, entry.name);
        if (entry.type === FileType.Directory) {
            files.push(...await findInfraFiles(entryPath));
        } else if (entry.type === FileType.File && /\.(?:json|bicep)$/i.test(entry.name)) {
            files.push(entryPath);
        }
    }
    return files;
}
