/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type DisposableLike = {
    dispose: () => unknown
}

const activeDebounces: { [id: string]: DisposableLike } = {};

/*
 *  To be used in validating user input through VS Code's showInputBox API
 */
export async function inputBoxDebounce<T>(id: string, callback: (...args: unknown[]) => Promise<T> | T, ...args: unknown[]): Promise<T> {
    // Remove active debounce if it already exists
    if (activeDebounces[id]) {
        activeDebounces[id].dispose();
        delete activeDebounces[id];
    }

    return new Promise((resolve) => {
        // Schedule the callback
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        const timeout = setTimeout(async () => {
            // Clear the callback since we're about to fire it
            activeDebounces[id].dispose();
            delete activeDebounces[id];

            // Fire the callback
            resolve(await callback(...args));
        }, 250);

        // Keep track of the active debounce
        activeDebounces[id] = {
            dispose: () => clearTimeout(timeout)
        };
    })
}
