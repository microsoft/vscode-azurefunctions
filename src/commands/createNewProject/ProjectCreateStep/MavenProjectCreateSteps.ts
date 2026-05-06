/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg } from '@microsoft/vscode-processutils';
import * as os from 'os';
import * as path from 'path';
import { JavaBuildTool } from '../../../constants';
import { ext } from '../../../extensionVariables';
import * as fsUtil from '../../../utils/fs';
import { mavenUtils } from '../../../utils/mavenUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { type IJavaProjectWizardContext } from '../javaSteps/IJavaProjectWizardContext';
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
            const args = composeArgs(
                withArg('archetype:generate'),
                withArg(...mavenUtils.formatMavenArg('archetypeGroupId', 'com.microsoft.azure')),
                withArg(...mavenUtils.formatMavenArg('archetypeArtifactId', 'azure-functions-archetype')),
                withArg(...mavenUtils.formatMavenArg('archetypeVersion', 'LATEST')),
                withArg(...mavenUtils.formatMavenArg('javaVersion', javaVersion)),
                withArg(...mavenUtils.formatMavenArg('groupId', nonNullProp(context, 'javaGroupId'))),
                withArg(...mavenUtils.formatMavenArg('artifactId', artifactId)),
                withArg(...mavenUtils.formatMavenArg('version', nonNullProp(context, 'javaProjectVersion'))),
                withArg(...mavenUtils.formatMavenArg('package', nonNullProp(context, 'javaPackageName'))),
                withArg(...mavenUtils.formatMavenArg('appName', nonNullProp(context, 'javaAppName'))),
                withArg('-B'), // in Batch Mode
            )();
            await mavenUtils.executeMvnCommand(
                context.telemetry.properties,
                ext.outputChannel,
                tempFolder,
                args,
            );
            await fsUtil.copyFolder(context, path.join(tempFolder, artifactId), context.projectPath);
        } finally {
            await AzExtFsExtra.deleteResource(tempFolder, { recursive: true });
        }
    }
}
