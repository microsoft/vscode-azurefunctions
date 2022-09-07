/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as os from 'os';
import * as path from 'path';
import { JavaBuildTool } from '../../../constants';
import { ext } from '../../../extensionVariables';
import * as fsUtil from '../../../utils/fs';
import { mavenUtils } from '../../../utils/mavenUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { IJavaProjectWizardContext } from '../javaSteps/IJavaProjectWizardContext';
import { ProjectCreateStepBase } from './ProjectCreateStepBase';

export class MavenProjectCreateStep extends ProjectCreateStepBase {

    public shouldExecute(context: IJavaProjectWizardContext): boolean {
        return context.buildTool === JavaBuildTool.maven;
    }

    public async executeCore(context: IJavaProjectWizardContext): Promise<void> {
        await mavenUtils.validateMavenInstalled(context);

        const javaVersion: string = nonNullProp(context, 'javaVersion');
        const artifactId: string = nonNullProp(context, 'javaArtifactId');
        const tempFolder: string = path.join(os.tmpdir(), fsUtil.getRandomHexString());
        await AzExtFsExtra.ensureDir(tempFolder);
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
                mavenUtils.formatMavenArg('DarchetypeVersion', 'LATEST'),
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
            await AzExtFsExtra.deleteResource(tempFolder, { recursive: true });
        }
    }
}
