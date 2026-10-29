/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';

suite('Node v4 TypeScript Blob templates', () => {
    let projectPath: string;

    setup(async () => {
        projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'azfunc-blob-template-'));
    });

    teardown(async () => {
        await fs.rm(projectPath, { recursive: true, force: true });
    });

    for (const templateId of ['BlobTrigger-TypeScript-4.x', 'EventGridBlobTrigger-TypeScript-4.x']) {
        test(`${templateId} compiles with strict null checking`, async function (this: Mocha.Context): Promise<void> {
            this.timeout(20 * 1000);
            const templates: { id: string; files: Record<string, string> }[] = require('../resources/backupTemplates/nodejs-4.x/templates/templates.json');
            const template = templates.find(candidate => candidate.id === templateId);
            assert.ok(template, `Missing template ${templateId}`);
            const source = template.files['%functionName%.ts']
                .replace(/%functionName%/g, 'storageBlobTrigger')
                .replace(/%path%/g, 'samples-workitems/{name}')
                .replace(/%connection%/g, 'AzureWebJobsStorage');
            assert.doesNotMatch(source, /%[^%]+%/);

            const sourcePath = path.join(projectPath, 'storageBlobTrigger.ts');
            await fs.writeFile(sourcePath, source);
            const program = ts.createProgram([sourcePath], {
                strict: true,
                noEmit: true,
                module: ts.ModuleKind.Node16,
                moduleResolution: ts.ModuleResolutionKind.Node16,
                target: ts.ScriptTarget.ES2022,
                types: ['node'],
                typeRoots: [path.dirname(path.dirname(require.resolve('@types/node/package.json')))],
                paths: {
                    '@azure/functions': [path.dirname(require.resolve('@azure/functions/package.json'))]
                }
            });
            const diagnostics = ts.getPreEmitDiagnostics(program);
            assert.strictEqual(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                getCanonicalFileName: fileName => fileName,
                getCurrentDirectory: () => projectPath,
                getNewLine: () => os.EOL
            }));
        });
    }
});
