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
const locations: string[] = ["East US", "South Central US", "West US 2", "West US 3", "Australia East", "Southeast Asia", "North Europe", "Sweden Central", "UK South", "East Asia", "East US 2", "East US 2 EUAP"];
export function getRotatingLocation(): string {
    locationCount += 1;
    return locations[locationCount % locations.length];
}

let nodeVersionCount: number = getStartingIndex();
const nodeVersions: RegExp[] = [/node.*20/i];
export function getRotatingNodeVersion(): RegExp {
    nodeVersionCount += 1;
    return nodeVersions[nodeVersionCount % nodeVersions.length];
}

let pyVersionCount: number = getStartingIndex();
const pyVersions: RegExp[] = [/python.*3\.10/i, /python.*3\.11/i];
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
