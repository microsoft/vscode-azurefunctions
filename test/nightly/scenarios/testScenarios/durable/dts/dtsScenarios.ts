/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzExtFunctionsTestScenario } from '../../AzExtFunctionsTestScenario';
import { generateTSNodeScenario } from './dtsTSNodeScenario';

export function generateDTSScenarios(): AzExtFunctionsTestScenario[] {
    return [
        generateTSNodeScenario(),
    ];
}
