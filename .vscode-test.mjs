/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { azExtTestConfig, createVscodeTestConfig } from '@microsoft/vscode-azext-eng/vscode-test';

export default [
    { ...azExtTestConfig, label: 'workspace' },
    createVscodeTestConfig({
        label: 'no-workspace',
        files: 'test/workspace.test.ts',
        workspaceFolder: undefined,
        env: { AZFUNC_TEST_NO_WORKSPACE: '1' },
    }),
];
