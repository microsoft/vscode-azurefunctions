/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:no-require-imports
import request = require('request-promise');
import { ProjectRuntime } from '../constants';
import { localize } from '../localize';

const npmRegistryUri: string = 'https://aka.ms/W2mvv3';

export interface INpmDistTag { tag: string; value: string; }

export async function getNpmDistTag(runtime: ProjectRuntime): Promise<INpmDistTag> {
    const tags: { [key: string]: string } = <{ [key: string]: string }>JSON.parse(await <Thenable<string>>request(npmRegistryUri));
    for (const key of Object.keys(tags)) {
        if ((runtime === ProjectRuntime.v1 && tags[key].startsWith('1')) ||
            (runtime === ProjectRuntime.v2 && tags[key].startsWith('2'))) {
            return { tag: key, value: tags[key] };
        }
    }

    throw new Error(localize('noDistTag', 'Failed to retrieve NPM tag for runtime "{0}".', runtime));
}
