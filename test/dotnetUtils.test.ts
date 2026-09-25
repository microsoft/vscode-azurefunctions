/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { dotnetUtils } from '../src/utils/dotnetUtils';
import { type cliFeedUtils } from '../src/utils/cliFeedUtils';

suite('dotnetUtils', () => {
    test('recognizes Azure.Functions.Sdk feed entries as isolated', () => {
        const runtimeInfo: cliFeedUtils.IWorkerRuntime = {
            displayInfo: {
                displayName: '.NET 11.0 Isolated',
                hidden: false
            },
            sdk: {
                name: 'Azure.Functions.Sdk'
            },
            targetFramework: 'net11.0',
            itemTemplates: '',
            projectTemplates: '',
            projectTemplateId: {
                csharp: ''
            },
            capabilities: ''
        };

        assert.strictEqual(dotnetUtils.getTemplateKeyFromFeedEntry(runtimeInfo), 'net11.0-isolated');
    });

    test('recognizes Azure.Functions.Sdk projects as isolated', async () => {
        const projectFile = new dotnetUtils.ProjectFile('test.csproj', '');
        projectFile.getContents = async () => '<Project Sdk="Azure.Functions.Sdk/1.0.1"></Project>';

        assert.strictEqual(await dotnetUtils.getIsIsolated(projectFile), true);
    });
});
