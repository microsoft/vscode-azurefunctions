/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AzExtFunctionsTestScenario } from "./AzExtFunctionsTestScenario";
import { generateDurableAzureStorageScenarios } from "./durable/azureStorage/azureStorageScenarios";
import { generateDurableDTSScenarios } from "./durable/dts/dtsScenarios";
import { generateHttpTriggerScenarios } from "./httpTrigger/httpTriggerScenarios";

export function generateTestScenarios(): AzExtFunctionsTestScenario[] {
    const testScenarios: AzExtFunctionsTestScenario[] = [
        // Trigger scenarios
        ...generateHttpTriggerScenarios(),

        // Durable scenarios
        ...generateDurableAzureStorageScenarios(),
        ...generateDurableDTSScenarios(),
    ];
    return testScenarios;
}
