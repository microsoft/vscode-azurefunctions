/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site } from '@azure/arm-appservice';
import * as assert from 'assert';
import { validatePythonDeploymentRuntime } from '../src/commands/deploy/validatePythonDeploymentRuntime';
import { ProjectLanguage } from '../src/constants';

suite('validatePythonDeploymentRuntime', () => {
    test('blocks Python 3.15 on conventional Linux apps', () => {
        assert.throws(
            () => validatePythonDeploymentRuntime(ProjectLanguage.Python, { linuxFxVersion: 'Python|3.15' }, {}),
            /Python 3\.15.*not supported/i
        );
    });

    test('blocks Python 3.15 on Flex Consumption apps', () => {
        const site: Site = { functionAppConfig: { runtime: { name: 'python', version: '3.15' } } };
        assert.throws(
            () => validatePythonDeploymentRuntime(ProjectLanguage.Python, {}, site),
            /Python 3\.15.*not supported/i
        );
    });

    test('allows other Python versions and non-Python apps', () => {
        assert.doesNotThrow(() => validatePythonDeploymentRuntime(ProjectLanguage.Python, { linuxFxVersion: 'Python|3.14' }, {}));
        assert.doesNotThrow(() => validatePythonDeploymentRuntime(ProjectLanguage.Python, {}, { functionAppConfig: { runtime: { name: 'python', version: '3.13' } } }));
        assert.doesNotThrow(() => validatePythonDeploymentRuntime(ProjectLanguage.JavaScript, { linuxFxVersion: 'Python|3.15' }, {}));
        assert.doesNotThrow(() => validatePythonDeploymentRuntime(ProjectLanguage.Python, { linuxFxVersion: 'Node|3.15' }, {}));
    });
});
