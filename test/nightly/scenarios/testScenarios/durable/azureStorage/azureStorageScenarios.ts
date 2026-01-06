/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzExtFunctionsTestScenario } from '../../AzExtFunctionsTestScenario';
import { generateJSNodeScenario } from './azureStorageJSNodeScenario';
import { generateDotnetIsolatedScenario } from './dotnetIsolated';
import { generatePythonScenario } from './pythonScenario';

export function generateDurableAzureStorageScenarios(): AzExtFunctionsTestScenario[] {
    return [
        generateJSNodeScenario(),
        generatePythonScenario(),
        generateDotnetIsolatedScenario(),
    ];
}
