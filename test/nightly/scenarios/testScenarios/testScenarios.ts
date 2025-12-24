/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzExtFunctionsTestScenario } from "./AzExtFunctionsTestScenario";
import { generateDTSScenarios } from "./dtsScenarios/dtsScenarios";

export function generateTestScenarios(): AzExtFunctionsTestScenario[] {
    const testScenarios: AzExtFunctionsTestScenario[] = [
        ...generateDTSScenarios(),
    ];
    return testScenarios;
}

