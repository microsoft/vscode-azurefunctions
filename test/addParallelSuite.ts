/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { delay, nonNullProp } from '../extension.bundle';
import { cleanTestWorkspace, longRunningTestsEnabled } from './global.test';

export interface ParallelTest {
    title: string;
    callback(): Promise<void>;
    task?: Promise<void>;
    skip?: boolean;

    /**
     * Turn off parallel behavior for this test
     */
    suppressParallel?: boolean;
}

export interface ParallelSuiteOptions {
    title: string;
    timeoutMS?: number;
    isLongRunning?: boolean;
    suiteSetup?: (testContext: Mocha.Context) => Promise<void>;
    suiteTeardown?: (testContext: Mocha.Context) => Promise<void>;

    /**
     * Turn off parallel behavior for this suite
     */
    suppressParallel?: boolean;

    /**
     * Add any other tests you may want for this suite
     */
    addTests?: () => void;
}

export function addParallelSuite(parallelTests: ParallelTest[], options: ParallelSuiteOptions): void {
    if (!options.title.includes("Create New Project")) {
        return;
    }
    suite.only(options.title, function (this: Mocha.Suite): void {
        this.timeout(options.timeoutMS || 30 * 1000);

        suiteSetup(async function (this: Mocha.Context): Promise<void> {
            if (options.isLongRunning && !longRunningTestsEnabled) {
                this.skip();
            }

            await cleanTestWorkspace();

            if (options.suiteSetup) {
                await options.suiteSetup(this);
            }

            if (!options.suppressParallel) {
                for (const t of parallelTests) {
                    if (!t.suppressParallel) {
                        const mochaGrep = process.env['MOCHA_grep'];
                        t.skip = t.skip || (!!mochaGrep && !(new RegExp(mochaGrep).test(`${options.title} ${t.title}`)));
                        if (!t.skip) {
                            t.task = t.callback();
                        }
                    }
                }
            }
        });

        suiteTeardown(async function (this: Mocha.Context): Promise<void> {
            if (!options.isLongRunning || longRunningTestsEnabled) {
                if (options.suiteTeardown) {
                    await options.suiteTeardown(this);
                }

                await cleanTestWorkspace();
            }
        });

        for (const t of parallelTests) {
            test(t.title, async function (this: Mocha.Context): Promise<void> {
                if (t.skip) {
                    this.skip();
                } else if (options.suppressParallel || t.suppressParallel) {
                    await t.callback();
                } else {
                    await nonNullProp(t, 'task');
                }
            });
        }

        if (options.addTests) {
            options.addTests();
        }
    });
}



const isRunningMap = new Map<string, boolean>();
export async function runInSeries(key: string, callback: () => Promise<void>): Promise<void> {
    while (isRunningMap.get(key)) {
        await delay(1000);
    }

    try {
        isRunningMap.set(key, true);
        await callback();
    } finally {
        isRunningMap.set(key, false);
    }
}
