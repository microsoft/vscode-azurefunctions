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

export class MavenProjectCreateStep extends ProjectCreateStepBase {
    private constructor() {
        super();
    }

    public static async createStep(context: IActionContext): Promise<MavenProjectCreateStep> {
        await mavenUtils.validateMavenInstalled(context);
        return new MavenProjectCreateStep();
    }

    public async executeCore(context: IJavaProjectWizardContext): Promise<void> {
        const javaVersion: string = nonNullProp(context, 'javaVersion');
        const artifactId: string = nonNullProp(context, 'javaArtifactId');
        const tempFolder: string = path.join(os.tmpdir(), fsUtil.getRandomHexString());
        await fse.ensureDir(tempFolder);
        try {
            // Use maven command to init Java function project.
            ext.outputChannel.show();
            await mavenUtils.executeMvnCommand(
                context.telemetry.properties,
                ext.outputChannel,
                tempFolder,
                'archetype:generate',
                mavenUtils.formatMavenArg('DarchetypeGroupId', 'com.microsoft.azure'),
                mavenUtils.formatMavenArg('DarchetypeArtifactId', 'azure-functions-archetype'),
                mavenUtils.formatMavenArg('DjavaVersion', javaVersion),
                mavenUtils.formatMavenArg('DgroupId', nonNullProp(context, 'javaGroupId')),
                mavenUtils.formatMavenArg('DartifactId', artifactId),
                mavenUtils.formatMavenArg('Dversion', nonNullProp(context, 'javaProjectVersion')),
                mavenUtils.formatMavenArg('Dpackage', nonNullProp(context, 'javaPackageName')),
                mavenUtils.formatMavenArg('DappName', nonNullProp(context, 'javaAppName')),
                '-B' // in Batch Mode
            );
            await fsUtil.copyFolder(context, path.join(tempFolder, artifactId), context.projectPath);
        } finally {
            await fse.remove(tempFolder);
        }
    }
}
