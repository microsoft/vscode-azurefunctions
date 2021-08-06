/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import { pomXmlFileName } from '../../../constants';
import { mavenUtils } from '../../../utils/mavenUtils';
import { IProjectWizardContext } from '../../createNewProject/IProjectWizardContext';
import { JavaInitVSCodeStep } from './JavaInitVSCodeStep';

export class MavenInitVSCodeStep extends JavaInitVSCodeStep {
    public getPackageCommand(): string {
        return "mvn clean package";
    }

    public getJavaDebugSubpath(functionAppName: string): string {
        return path.posix.join('target', 'azure-functions', functionAppName);
    }

    public getFunctionAppName(context: IProjectWizardContext): Promise<string | undefined> {
        const pomXmlPath: string = path.join(context.projectPath, pomXmlFileName);
        return Promise.resolve(mavenUtils.getFunctionAppNameInPom(pomXmlPath));
    }
}
