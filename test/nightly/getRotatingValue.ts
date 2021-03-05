/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

let authCount: number = getStartingIndex();
const authLevels: string[] = ['Anonymous', 'Function', 'Admin'];
export function getRotatingAuthLevel(): string {
    authCount += 1;
    return authLevels[authCount % authLevels.length];
}

let locationCount: number = getStartingIndex();
const locations: string[] = ['Australia East', 'East Asia', 'East US', 'North Europe', 'South Central US', 'Southeast Asia', 'UK South', 'West Europe'];
export function getRotatingLocation(): string {
    locationCount += 1;
    return locations[locationCount % locations.length];
}

let nodeVersionCount: number = getStartingIndex();
const nodeVersions: RegExp[] = [/node.*10/i, /node.*12/i, /node.*14/i];
export function getRotatingNodeVersion(): RegExp {
    nodeVersionCount += 1;
    return nodeVersions[nodeVersionCount % nodeVersions.length];
}

let pyVersionCount: number = getStartingIndex();
const pyVersions: RegExp[] = [/python.*3\.6/i, /python.*3\.7/i, /python.*3\.8/i, /python.*3\.9/i];
export function getRotatingPythonVersion(): RegExp {
    pyVersionCount += 1;
    return pyVersions[pyVersionCount % pyVersions.length];
}

/**
 * Adds a little more spice to the rotation
 */
function getStartingIndex(): number {
    if (process.platform === 'darwin') {
        return 0;
    } else if (process.platform === 'win32') {
        return 1;
    } else {
        return 2;
    }
}
