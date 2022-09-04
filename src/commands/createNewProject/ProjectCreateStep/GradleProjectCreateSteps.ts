/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { Progress } from 'vscode';
import { buildGradleFileName, JavaBuildTool, settingsGradleFileName } from '../../../constants';
import { confirmOverwriteFile } from '../../../utils/fs';
import { gradleUtils } from '../../../utils/gradleUtils';
import { javaUtils } from '../../../utils/javaUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { IJavaProjectWizardContext } from '../javaSteps/IJavaProjectWizardContext';
import { java8 } from '../javaSteps/JavaVersionStep';
import { ScriptProjectCreateStep } from './ScriptProjectCreateStep';

const backupGradlePluginVersion = "1.8.2";
const metaDataUrl = "https://plugins.gradle.org/m2/com/microsoft/azure/azure-functions-gradle-plugin/maven-metadata.xml";

export class GradleProjectCreateStep extends ScriptProjectCreateStep {
    protected gitignore: string = gradleGitignore;

    public async executeCore(context: IJavaProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        await gradleUtils.validateGradleInstalled(context);
        await super.executeCore(context, progress);

        const settingsGradlePath: string = path.join(context.projectPath, settingsGradleFileName);
        if (await confirmOverwriteFile(context, settingsGradlePath)) {
            await AzExtFsExtra.writeFile(settingsGradlePath, this.getSettingsGradleContent(context));
        }

        const buildGradlePath: string = path.join(context.projectPath, buildGradleFileName);
        const buildGradleContent: string = await this.getBuildGradleContent(context);
        if (await confirmOverwriteFile(context, buildGradlePath)) {
            await AzExtFsExtra.writeFile(buildGradlePath, buildGradleContent);
        }
    }

    public shouldExecute(context: IJavaProjectWizardContext): boolean {
        return context.buildTool === JavaBuildTool.gradle;
    }

    async getLatestGradlePluginVersion(context: IJavaProjectWizardContext): Promise<string> {
        try {
            const templateVersion: string | undefined = await javaUtils.getLatestArtifactVersionFromMetaData(context, metaDataUrl);
            return templateVersion ? templateVersion : backupGradlePluginVersion;
        } catch (error) {
            return backupGradlePluginVersion;
        }
    }

    getSettingsGradleContent(context: IJavaProjectWizardContext): string {
        return `rootProject.name = "${context.javaArtifactId}"`;
    }

    getCompatibilityVersion(context: IJavaProjectWizardContext): string {
        const javaVersion: string = nonNullProp(context, 'javaVersion');
        return javaVersion === java8 ? "1.8" : javaVersion;
    }

    async getBuildGradleContent(context: IJavaProjectWizardContext): Promise<string> {
        return `plugins {
  id "com.microsoft.azure.azurefunctions" version "${await this.getLatestGradlePluginVersion(context)}"
}
apply plugin: 'java'
apply plugin: "com.microsoft.azure.azurefunctions"

group '${context.javaGroupId}'
version '${context.javaProjectVersion}'

dependencies {
    implementation 'com.microsoft.azure.functions:azure-functions-java-library:1.4.2'
    testImplementation 'org.junit.jupiter:junit-jupiter:5.6.2'
    testImplementation 'org.mockito:mockito-core:3.3.3'
}

sourceCompatibility = '${this.getCompatibilityVersion(context)}'
targetCompatibility = '${this.getCompatibilityVersion(context)}'

compileJava.options.encoding = 'UTF-8'

repositories {
    mavenCentral()
}

azurefunctions {
    resourceGroup = 'java-functions-group'
    appName = '${context.javaAppName}'
    pricingTier = 'Consumption'
    region = 'westus'
    runtime {
      os = 'windows'
      javaVersion = '${context.javaVersion}'
    }
    localDebug = "transport=dt_socket,server=y,suspend=n,address=5005"
}
`;
    }
}

const gradleGitignore: string = `# Compiled class file
*.class

# Log file
*.log

# BlueJ files
*.ctxt

# Mobile Tools for Java (J2ME)
.mtj.tmp/

# Package Files #
*.jar
*.war
*.nar
*.ear
*.zip
*.tar.gz
*.rar

# virtual machine crash logs, see http://www.java.com/en/download/help/error_hotspot.xml
hs_err_pid*

# Build output
target/

*.factorypath

# IDE
.idea/
*.iml
.classpath
.project
.settings/
.checkstyle
.vscode/

# macOS
.DS_Store

# gradle-wrapper
!gradle/wrapper/gradle-wrapper.jar
!gradle/wrapper/gradle-wrapper.properties

# integration test
*/src/it/*/bin

jacoco.exec
bin/

# mvnw
!.mvn/wrapper/maven-wrapper.jar

build/

.gradle/
`;

