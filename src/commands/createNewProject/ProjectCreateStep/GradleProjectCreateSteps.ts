/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { Progress } from 'vscode';
import { buildGradleFileName, settingsGradleFileName } from '../../../constants';
import { localize } from '../../../localize';
import { confirmOverwriteFile } from '../../../utils/fs';
import { IJavaProjectWizardContext } from '../javaSteps/IJavaProjectWizardContext';
import { java11, java8 } from '../javaSteps/JavaVersionStep';
import { ScriptProjectCreateStep } from './ScriptProjectCreateStep';

export class GradleProjectCreateStep extends ScriptProjectCreateStep {
    protected gitignore: string = gradleGitignore;

    public async executeCore(context: IJavaProjectWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {
        super.executeCore(context, progress);

        const settingsGradlePath: string = path.join(context.projectPath, settingsGradleFileName);
        if (await confirmOverwriteFile(context, settingsGradlePath)) {
            await fse.writeFile(settingsGradlePath, this.getSettingsGradleContent(context));
        }

        const buildGradlePath: string = path.join(context.projectPath, buildGradleFileName);
        if (await confirmOverwriteFile(context, buildGradlePath)) {
            await fse.writeFile(buildGradlePath, this.getBuildGradleContent(context));
        }
    }

    getSettingsGradleContent(context: IJavaProjectWizardContext): any {
        return `rootProject.name = "${context.javaArtifactId}"`;
    }

    getCompatibilityVersion(javaVersion: string | undefined): string {
        if (javaVersion === java8) {
            return "1.8";
        } else if (javaVersion === java11) {
            return "11";
        } else {
            throw new Error(localize('invalidJavaVersion', 'Invalid Java version "{0}".', javaVersion));
        }
    }

    getBuildGradleContent(context: IJavaProjectWizardContext): string {
        return `plugins {
  id "com.microsoft.azure.azurefunctions" version "1.6.0"
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

sourceCompatibility = '${this.getCompatibilityVersion(context.javaVersion)}'
targetCompatibility = '${this.getCompatibilityVersion(context.javaVersion)}'

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

