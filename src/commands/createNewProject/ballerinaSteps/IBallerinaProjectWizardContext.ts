/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { type BallerinaBackend } from '../../../constants';
import { type IProjectWizardContext } from "../IProjectWizardContext";

export interface IBallerinaProjectWizardContext extends IProjectWizardContext {
    balBackend?: BallerinaBackend;
}

export function getBallerinaPackagePath(projectPath: string): string {
    return path.join(projectPath);
}

export function getBallerinaFunctionFilePath(projectPath: string, functionName: string): string {
    return path.join(getBallerinaPackagePath(projectPath), functionName + '.bal');
}
