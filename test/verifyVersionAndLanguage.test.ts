/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FuncVersion, ProjectLanguage, verifyVersionAndLanguage } from '../extension.bundle';
import { assertThrowsAsync } from './assertThrowsAsync';
import { createTestActionContext } from './global.test';

suite('verifyVersionAndLanguage', () => {
    test('Local: ~1, Remote: none', async () => {
        const props: { [name: string]: string } = {};
        await verifyVersionAndLanguage(createTestActionContext(), 'testSite', FuncVersion.v1, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~1, Remote: ~1', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~1'
        };
        await verifyVersionAndLanguage(createTestActionContext(), 'testSite', FuncVersion.v1, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~1, Remote: 1.0.0', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '1.0.0'
        };
        await verifyVersionAndLanguage(createTestActionContext(), 'testSite', FuncVersion.v1, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~1, Remote: ~2', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2'
        };
        const context = createTestActionContext();
        await context.ui.runWithInputs(['Deploy Anyway'], async () => {
            await verifyVersionAndLanguage(context, 'testSite', FuncVersion.v1, ProjectLanguage.JavaScript, props);
        });
    });

    test('Local: ~1, Remote: 2.0.0', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '2.0.0'
        };
        const context = createTestActionContext();
        await context.ui.runWithInputs(['Deploy Anyway'], async () => {
            await verifyVersionAndLanguage(context, 'testSite', FuncVersion.v1, ProjectLanguage.JavaScript, props);
        });
    });

    test('Local: ~2, Remote: none', async () => {
        const props: { [name: string]: string } = {};
        await verifyVersionAndLanguage(createTestActionContext(), 'testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~2, Remote: ~2', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2'
        };
        await verifyVersionAndLanguage(createTestActionContext(), 'testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~2, Remote: 2.0.0', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '2.0.0'
        };
        await verifyVersionAndLanguage(createTestActionContext(), 'testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~2, Remote: ~1', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~1'
        };
        const context = createTestActionContext();
        await context.ui.runWithInputs(['Deploy Anyway'], async () => {
            await verifyVersionAndLanguage(context, 'testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
        });
    });

    test('Local: ~2, Remote: 1.0.0', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '1.0.0'
        };
        const context = createTestActionContext();
        await context.ui.runWithInputs(['Deploy Anyway'], async () => {
            await verifyVersionAndLanguage(context, 'testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
        });
    });

    test('Local: ~2/node, Remote: ~2/node', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2',
            FUNCTIONS_WORKER_RUNTIME: 'node'
        };
        await verifyVersionAndLanguage(createTestActionContext(), 'testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~2/node, Remote: ~2/dotnet', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2',
            FUNCTIONS_WORKER_RUNTIME: 'dotnet'
        };
        await assertThrowsAsync(async () => await verifyVersionAndLanguage(createTestActionContext(), 'testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props), /dotnet.*match.*node/i);
    });

    test('Local: ~2/node, Remote: ~1/dotnet', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~1',
            FUNCTIONS_WORKER_RUNTIME: 'dotnet'
        };
        await assertThrowsAsync(async () => await verifyVersionAndLanguage(createTestActionContext(), 'testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props), /dotnet.*match.*node/i);
    });

    test('Local: ~2/unknown, Remote: ~2/dotnet', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2',
            FUNCTIONS_WORKER_RUNTIME: 'dotnet'
        };
        await verifyVersionAndLanguage(createTestActionContext(), 'testSite', FuncVersion.v2, <ProjectLanguage>"unknown", props);
    });

    test('Local: ~2/C#, Remote: ~2/unknown', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2',
            FUNCTIONS_WORKER_RUNTIME: 'unknown'
        };
        await verifyVersionAndLanguage(createTestActionContext(), 'testSite', FuncVersion.v2, ProjectLanguage.CSharp, props);
    });

    test('Local: ~2/unknown, Remote: ~2/unknown', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2',
            FUNCTIONS_WORKER_RUNTIME: 'unknown'
        };
        await verifyVersionAndLanguage(createTestActionContext(), 'testSite', FuncVersion.v2, <ProjectLanguage>"unknown", props);
    });
});
