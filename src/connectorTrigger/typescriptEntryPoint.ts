/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { workspace } from 'vscode';
import { localize } from '../localize';
import { isPathEqual } from '../utils/fs';
import { parseJson } from '../utils/parseJson';

export async function getSingleTypeScriptEntryPoint(projectPath: string): Promise<string | undefined> {
    const packageJson = parseJson<{ main?: unknown }>(await AzExtFsExtra.readFile(path.join(projectPath, 'package.json')));
    const main = packageJson.main;
    if (typeof main !== 'string' || /[*?{}[\]]/.test(main)) {
        return undefined;
    }
    const configPath = path.join(projectPath, 'tsconfig.json');
    const config = await AzExtFsExtra.pathExists(configPath) ?
        parseJson<{ extends?: unknown; compilerOptions?: {
            rootDir?: unknown; outDir?: unknown; noEmit?: boolean; noResolve?: boolean; emitDeclarationOnly?: boolean; outFile?: unknown;
        } }>(await AzExtFsExtra.readFile(configPath)) : undefined;
    const compiler = config?.compilerOptions;
    if (config?.extends || typeof compiler?.rootDir !== 'string' || typeof compiler.outDir !== 'string' ||
        compiler.noEmit || compiler.noResolve || compiler.emitDeclarationOnly || compiler.outFile || !main.endsWith('.js')) {
        throw unsupportedEntryPoint();
    }
    const root = path.resolve(projectPath, compiler.rootDir);
    const output = path.resolve(projectPath, compiler.outDir);
    const builtEntry = path.resolve(projectPath, main);
    const relativeOutput = path.relative(output, builtEntry);
    if (!isInside(projectPath, root) || !isInside(projectPath, output) ||
        !relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
        throw unsupportedEntryPoint();
    }
    const source = path.resolve(root, relativeOutput.slice(0, -3) + '.ts');
    if (!isInside(projectPath, source) || !await AzExtFsExtra.pathExists(source)) {
        throw unsupportedEntryPoint();
    }
    return source;
}

export async function addTypeScriptEntryImports(entry: string, handlerPaths: readonly (string | undefined)[]): Promise<void> {
    if (workspace.textDocuments.some(document => document.isDirty && isPathEqual(document.uri.fsPath, entry))) {
        throw new Error(localize('connectorTypeScriptEntryDirty',
            'Save the TypeScript entry file before adding Connector Trigger functions.'));
    }
    const original = await AzExtFsExtra.readFile(entry);
    let contents = original;
    const eol = contents.includes('\r\n') ? '\r\n' : '\n';
    for (const handler of handlerPaths) {
        if (!handler) {
            continue;
        }
        let relative = path.relative(path.dirname(entry), handler).replace(/\\/g, '/').replace(/\.ts$/, '.js');
        if (!relative.startsWith('.')) {
            relative = `./${relative}`;
        }
        const statement = `import '${relative}';`;
        if (!contents.split(/\r?\n/).some(line => line.trim() === statement)) {
            contents += `${contents.length && !contents.endsWith('\n') ? eol : ''}${statement}${eol}`;
        }
    }
    if (contents !== original) {
        await AzExtFsExtra.writeFile(entry, contents);
    }
}

function isInside(projectPath: string, candidate: string): boolean {
    const relative = path.relative(projectPath, candidate);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function unsupportedEntryPoint(): Error {
    return new Error(localize('connectorTypeScriptEntryUnsupported',
        'The TypeScript entry point cannot be mapped to a source file. Configure rootDir and outDir in tsconfig.json or use a Functions handler glob in package.json.'));
}
