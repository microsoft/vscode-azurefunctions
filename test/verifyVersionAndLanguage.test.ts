/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FuncVersion, ProjectLanguage, verifyVersionAndLanguage } from '../extension.bundle';
import { assertThrowsAsync } from './assertThrowsAsync';
import { testUserInput } from './global.test';

// tslint:disable-next-line: max-func-body-length
suite('verifyVersionAndLanguage', () => {
    test('Local: ~1, Remote: none', async () => {
        const props: { [name: string]: string } = {};
        await verifyVersionAndLanguage('testSite', FuncVersion.v1, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~1, Remote: ~1', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~1'
        };
        await verifyVersionAndLanguage('testSite', FuncVersion.v1, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~1, Remote: 1.0.0', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '1.0.0'
        };
        await verifyVersionAndLanguage('testSite', FuncVersion.v1, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~1, Remote: ~2', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2'
        };
        await testUserInput.runWithInputs(['Deploy Anyway'], async () => {
            await verifyVersionAndLanguage('testSite', FuncVersion.v1, ProjectLanguage.JavaScript, props);
        });
    });

    test('Local: ~1, Remote: 2.0.0', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '2.0.0'
        };
        await testUserInput.runWithInputs(['Deploy Anyway'], async () => {
            await verifyVersionAndLanguage('testSite', FuncVersion.v1, ProjectLanguage.JavaScript, props);
        });
    });

    test('Local: ~2, Remote: none', async () => {
        const props: { [name: string]: string } = {};
        await verifyVersionAndLanguage('testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~2, Remote: ~2', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2'
        };
        await verifyVersionAndLanguage('testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~2, Remote: 2.0.0', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '2.0.0'
        };
        await verifyVersionAndLanguage('testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~2, Remote: ~1', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~1'
        };
        await testUserInput.runWithInputs(['Deploy Anyway'], async () => {
            await verifyVersionAndLanguage('testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
        });
    });

    test('Local: ~2, Remote: 1.0.0', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '1.0.0'
        };
        await testUserInput.runWithInputs(['Deploy Anyway'], async () => {
            await verifyVersionAndLanguage('testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
        });
    });

    test('Local: ~2/node, Remote: ~2/node', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2',
            FUNCTIONS_WORKER_RUNTIME: 'node'
        };
        await verifyVersionAndLanguage('testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props);
    });

    test('Local: ~2/node, Remote: ~2/dotnet', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2',
            FUNCTIONS_WORKER_RUNTIME: 'dotnet'
        };
        await assertThrowsAsync(async () => await verifyVersionAndLanguage('testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props), /dotnet.*match.*node/i);
    });

    test('Local: ~2/node, Remote: ~1/dotnet', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~1',
            FUNCTIONS_WORKER_RUNTIME: 'dotnet'
        };
        await assertThrowsAsync(async () => await verifyVersionAndLanguage('testSite', FuncVersion.v2, ProjectLanguage.JavaScript, props), /dotnet.*match.*node/i);
    });

    test('Local: ~2/unknown, Remote: ~2/dotnet', async () => {
        const props: { [name: string]: string } = {
            FUNCTIONS_EXTENSION_VERSION: '~2',
            FUNCTIONS_WORKER_RUNTIME: 'dotnet'
        };
        await verifyVersionAndLanguage('testSite', FuncVersion.v2, <ProjectLanguage>"unknown", props);
    });
});
