/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "../../../../extension.bundle";
import { type CreateMode } from "../../../utils/createFunctionAppUtils";

/**
 * Defines a test scenario for Azure Functions extension testing.
 *
 * Each scenario follows this execution flow:
 * 1. A single workspace project is created first (`createNewProject`)
 * 2. Multiple create-and-deploy test cases branch off from the shared project
 * 3. Within each test case, function app creation and deployment execute in series
 *
 * ```
 *                    Test Scenario
 *                         │
 *                ┌────────┴────────┐
 *                │  Create New     │
 *                │    Project      │
 *                └────────┬────────┘
 *         ┌───────┬───────┼───────┬───────┐    (concurrent)
 *         ▼       ▼       ▼       ▼       ▼
 *      ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
 *      │Create│ │Create│ │Create│ │Create│ │Create│    (in series)
 *      │ Func │ │ Func │ │ Func │ │ Func │ │ Func │
 *      │ App  │ │ App  │ │ App  │ │ App  │ │ App  │
 *      └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘
 *         ▼        ▼        ▼        ▼        ▼
 *      ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
 *      │Deploy│ │Deploy│ │Deploy│ │Deploy│ │Deploy│
 *      │ Func │ │ Func │ │ Func │ │ Func │ │ Func │
 *      │ App  │ │ App  │ │ App  │ │ App  │ │ App  │
 *      └──────┘ └──────┘ └──────┘ └──────┘ └──────┘
 * ```
 */
export interface AzExtFunctionsTestScenario {
    /**
     * A descriptive label for the test scenario.
     */
    label: string;

    /**
     * The name of the folder where the test project will be created.
     * Should match the name provided under `test.code-workspace`
     */
    folderName: string;

    /**
     * The test case for creating a new workspace project.
     * This test will always execute before creating and deploying to a function app.
     */
    createNewProjectTest: CreateNewProjectTestCase;

    /**
     * Test cases for creating and deploying function apps.
     * These tests execute after project creation completes successfully.
     */
    createAndDeployTests: {
        /**
         * Core test cases representing high-value smoke/regression tests that run as part of the
         * nightly test suite. Keep this set small and focused on critical paths that we expect to pass.
         */
        core: CreateAndDeployTestCase[];

        /**
         * Expanded test cases providing broader, more exploratory coverage. Intended to be
         * triggered manually for on-demand, deep-dive inspection rather than nightly runs
         * due to their more comprehensive nature.
         */
        expanded?: CreateAndDeployTestCase[];
    };

    /**
     * Indicates this scenario should be executed exclusively. This should only be used to aid with local development.
     */
    only?: boolean;
}

export interface CreateNewProjectTestCase {
    /**
     * A descriptive label for the test case.
     */
    label: string;

    /**
     * The sequence of inputs to provide during workspace project creation.
     */
    inputs: (string | RegExp)[];

    /**
     * Indicates this test case should be executed exclusively. This should only be used to aid with local development.
     */
    only?: boolean;
}

export interface CreateAndDeployTestCase {
    /**
     * Configuration for creating a function app.
     * This step executes first before deployment.
     */
    createFunctionApp: {
        /**
         * A descriptive label for the create function app test.
         */
        label: string;

        /**
         * The mode used to create the function app (e.g., basic, advanced).
         */
        mode: CreateMode;

        /**
         * The sequence of inputs to provide during function app creation.
         */
        inputs: (string | RegExp)[];
    };

    /**
     * Configuration for deploying a function app.
     * This step executes in series after the workspace project and function app have been created.
     */
    deployFunctionApp: {
        /**
         * A descriptive label for the deploy function app test.
         */
        label: string;

        /**
         * The sequence of inputs to provide during function app deployment.
         */
        inputs: (string | RegExp)[];

        /**
         * An optional callback to run after the deployment test completes.
         * Note: Highly recommend implementing this as a verification post step as deployment may succeed initially, but fail at runtime.
         */
        postTest?: (context: IActionContext, functionAppId: string) => void | Promise<void>;
    };

    /**
     * Resource groups to delete after the test completes for cleanup.
     */
    resourceGroupsToDelete?: string[];

    /**
     * Indicates this test case should be executed exclusively. This should only be used to aid with local development.
     */
    only?: boolean;
}
