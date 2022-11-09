/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type DisposableLike = {
    dispose: () => any
}

const activeDebounces: { [id: string]: DisposableLike } = {};

export async function debounce<T>(delay: number, id: string, callback: (...args: unknown[]) => Promise<T> | T, ...args: unknown[]): Promise<T> {
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
        }, delay);

        // Keep track of the active debounce
        activeDebounces[id] = {
            dispose: () => clearTimeout(timeout),
        };
    })
}
