/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fse from 'fs-extra';
import * as path from 'path';
import { buildGradleFileName } from '../../../constants';
import { IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';
import { JavaInitVSCodeStep } from './JavaInitVSCodeStep';

export class GradleInitVSCodeStep extends JavaInitVSCodeStep {
    public getPackageCommand(): string {
        return "gradle azureFunctionsPackage";
    }

    public getJavaDebugSubpath(functionAppName: string): string {
        return path.posix.join('build', 'azure-functions', functionAppName);
    }

    public getFunctionAppName(context: IProjectWizardContext): Promise<string | undefined> {
        const buildGradlePath: string = path.join(context.projectPath, buildGradleFileName);
        return fse.readFile(buildGradlePath, 'utf-8').then(content => {
            const match: RegExpExecArray | null = /appName\s*?=\s*?['|"](.+?)['|"]/g.exec(content);
            return match ? match[1] : undefined;
        });
    }
}
