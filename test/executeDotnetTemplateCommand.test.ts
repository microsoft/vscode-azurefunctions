/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getFrameworkFromVersions } from '../src/templates/dotnet/executeDotnetTemplateCommand';

suite('executeDotnetTemplateCommand', () => {
    test('recognizes .NET 11 SDK', () => {
        const versions = '11.0.100 [C:\\Program Files\\dotnet\\sdk]';

        assert.strictEqual(getFrameworkFromVersions(versions), 'net11.0');
    });

    test('recognizes preview .NET 11 SDK', () => {
        const versions = '11.0.100-preview.7.25380.108 [C:\\Program Files\\dotnet\\sdk]';

        assert.strictEqual(getFrameworkFromVersions(versions), 'net11.0');
    });
});
