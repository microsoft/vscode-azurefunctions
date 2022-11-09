/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type DisposableLike = {
    dispose: () => any
}

const activeDebounces: { [id: string]: DisposableLike } = {};

/*
 *  To be used in validating user input through VS Code's showInputBox API
 *  VS Code's validateInput callback can throw a silent timeout error when the delay is too long and defaults to a return of 'undefined' (causing false returns)
 *  This function defaults to 1000ms for safety/consistency.
 */
export async function inputBoxDebounce<T>(id: string, callback: (...args: unknown[]) => Promise<T> | T, ...args: unknown[]): Promise<T> {
    return new Promise((resolve) => {
        // Remove active debounce if it already exists
        if (activeDebounces[id]) {
            activeDebounces[id].dispose();
            delete activeDebounces[id];
        }

        // Schedule the callback
        const timeout = setTimeout(async () => {
            // Clear the callback since we're about to fire it
            activeDebounces[id].dispose();
            delete activeDebounces[id];

            // Fire the callback
            resolve(await callback(...args));
        }, 1000);

        // Keep track of the active debounce
        activeDebounces[id] = {
            dispose: () => clearTimeout(timeout)
        };
    })
}
