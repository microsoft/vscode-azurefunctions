/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "../../../../extension.bundle";
import { type CreateMode } from "../../../utils/createFunctionAppUtils";

export interface AzExtFunctionsTestScenario {
    label: string;
    folderName: string;
    createNewProjectTest: CreateNewProjectTestCase;
    createAndDeployTests: CreateAndDeployTestCase[];

    /**
     * Indicates this scenario should be executed exclusively. This should only be used during local development.
     */
    only?: boolean;
}

export interface CreateNewProjectTestCase {
    label: string;
    inputs: (string | RegExp)[];
    postTest?: (context: IActionContext, workspaceFolderPath: string, errMsg?: string) => void | Promise<void>;

    /**
     * Indicates this test case should be executed exclusively. This should only be used during local development.
     */
    only?: boolean;
}

export interface CreateAndDeployTestCase {
    createFunctionApp: {
        label: string;
        mode: CreateMode;
        inputs: (string | RegExp)[];
        postTest?: (context: IActionContext, functionAppId: string, errMsg?: string) => void | Promise<void>;
    };
    deployFunctionApp: {
        label: string;
        inputs: (string | RegExp)[];
        preTest?: (context: IActionContext, functionAppId: string, errMsg?: string) => void | Promise<void>;
        postTest?: (context: IActionContext, functionAppId: string, errMsg?: string) => void | Promise<void>;
    };
    resourceGroupToDelete?: string;

    /**
     * Indicates this test case should be executed exclusively. This should only be used during local development.
     */
    only?: boolean;
}
