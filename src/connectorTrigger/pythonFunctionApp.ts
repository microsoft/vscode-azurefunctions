/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../localize';

export function getPythonFunctionAppName(contents: string): string {
    const code = contents.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\r\n]*/g,
        match => match.replace(/[^\r\n]/g, ' '));
    const names = [...code.matchAll(/^([A-Za-z_]\w*)\s*=\s*func\.FunctionApp\s*\(/gm)].map(match => match[1]);
    if (names.length !== 1) {
        throw new Error(localize('connectorPythonFunctionAppAmbiguous',
            'The project must contain one top-level assignment to func.FunctionApp() before adding Connector Trigger functions.'));
    }
    return names[0];
}
