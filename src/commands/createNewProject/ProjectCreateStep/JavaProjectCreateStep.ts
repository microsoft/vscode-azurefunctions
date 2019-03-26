/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../../extensionVariables';
import * as fsUtil from '../../../utils/fs';
import { mavenUtils } from '../../../utils/mavenUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { IJavaProjectWizardContext } from '../javaSteps/IJavaProjectWizardContext';
import { ProjectCreateStepBase } from './ProjectCreateStepBase';

export class JavaProjectCreateStep extends ProjectCreateStepBase {
    private constructor() {
        super();
    }

    public static async createStep(actionContext: IActionContext): Promise<JavaProjectCreateStep> {
        await mavenUtils.validateMavenInstalled(actionContext);
        return new JavaProjectCreateStep();
    }

    public async executeCore(wizardContext: IJavaProjectWizardContext): Promise<void> {
        const artifactId: string = nonNullProp(wizardContext, 'javaArtifactId');
        const tempFolder: string = path.join(os.tmpdir(), fsUtil.getRandomHexString());
        await fse.ensureDir(tempFolder);
        try {
            // Use maven command to init Java function project.
            ext.outputChannel.show();
            await mavenUtils.executeMvnCommand(
                wizardContext.actionContext.properties,
                ext.outputChannel,
                tempFolder,
                'archetype:generate',
                mavenUtils.formatMavenArg('DarchetypeGroupId', 'com.microsoft.azure'),
                mavenUtils.formatMavenArg('DarchetypeArtifactId', 'azure-functions-archetype'),
                mavenUtils.formatMavenArg('DgroupId', nonNullProp(wizardContext, 'javaGroupId')),
                mavenUtils.formatMavenArg('DartifactId', artifactId),
                mavenUtils.formatMavenArg('Dversion', nonNullProp(wizardContext, 'javaVersion')),
                mavenUtils.formatMavenArg('Dpackage', nonNullProp(wizardContext, 'javaPackageName')),
                mavenUtils.formatMavenArg('DappName', nonNullProp(wizardContext, 'javaAppName')),
                '-B' // in Batch Mode
            );
            await fsUtil.copyFolder(path.join(tempFolder, artifactId), wizardContext.projectPath);
        } finally {
            await fse.remove(tempFolder);
        }
    }
}
