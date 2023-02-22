/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { BallerinaBackend } from '../../../constants';
import { IProjectWizardContext } from "../IProjectWizardContext";

export interface IBallerinaProjectWizardContext extends IProjectWizardContext {
    balVersion?: string;
    balOrgName: string;
    balPackageName?: string;
    balBackend?: BallerinaBackend;
}

export function getBallerinaPackagePath(projectPath: string): string {
    return path.join(projectPath);
}

export function getBallerinaFunctionFilePath(projectPath: string, functionName: string): string {
    return path.join(getBallerinaPackagePath(projectPath), functionName + '.bal');
}
