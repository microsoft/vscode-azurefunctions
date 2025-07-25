/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { JavaBuildTool, javaBuildTool, pomXmlFileName } from '../../constants';
import { localize } from '../../localize';
import { mavenUtils } from '../../utils/mavenUtils';
import { parseJson } from '../../utils/parseJson';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { type ITemplates } from '../ITemplates';
import { TemplateSchemaVersion, TemplateType } from '../TemplateProviderBase';
import { ScriptTemplateProvider } from '../script/ScriptTemplateProvider';
import { english } from '../script/getScriptResourcesLanguage';
import { parseScriptTemplates } from '../script/parseScriptTemplates';

/**
 * Describes templates output before it has been parsed
 */
interface IRawJavaTemplates {
    templates: object[];
}

/**
 * Java templates largely follow the same formatting as script templates, but they come from maven
 */
export class JavaTemplateProvider extends ScriptTemplateProvider {
    public templateType: TemplateType = TemplateType.Java;
    public templateSchemaVersion: TemplateSchemaVersion = TemplateSchemaVersion.v1;

    protected get backupSubpath(): string {
        return path.join('java', this.version);
    }

    public async getLatestTemplateVersion(): Promise<string> {
        this.validateGradleProject();
        const pomPath: string = path.join(this.getProjectPath(), pomXmlFileName);
        const pomFileContent = await AzExtFsExtra.readFile(pomPath);
        if (!pomFileContent) {
            throw new Error(localize('failedToReadPom', 'Failed to read pom.xml file.'));
        }
        const pomContents: string = pomFileContent.toString();
        const match: RegExpMatchArray | null = pomContents.match(/<azure.functions.maven.plugin.version>(.*)<\/azure.functions.maven.plugin.version>/i);
        if (!match) {
            throw new Error(localize('failedToDetectPluginVersion', 'Failed to detect Azure Functions maven plugin version.'));
        } else {
            return match[1].trim();
        }
    }

    public async getLatestTemplates(context: IActionContext): Promise<ITemplates> {
        this.validateGradleProject();
        await mavenUtils.validateMavenInstalled(context);
        const projectPath: string = this.getProjectPath();
        const commandResult: string = await mavenUtils.executeMvnCommand(context.telemetry.properties, undefined, projectPath, 'azure-functions:list');
        const regExp: RegExp = />> templates begin <<([\S\s]+)^.+INFO.+ >> templates end <<$[\S\s]+>> bindings begin <<([\S\s]+)^.+INFO.+ >> bindings end <<$[\S\s]+>> resources begin <<([\S\s]+)^.+INFO.+ >> resources end <<$/gm;
        const regExpResult: RegExpExecArray | null = regExp.exec(commandResult);
        if (regExpResult && regExpResult.length > 3) {
            this._rawTemplates = parseJson<IRawJavaTemplates>(regExpResult[1]).templates;
            this._rawBindings = parseJson(regExpResult[2]);
            this._rawResources = parseJson(regExpResult[3]);
            return parseScriptTemplates(this._rawResources, this._rawTemplates, this._rawBindings);
        } else {
            throw new Error(localize('oldFunctionPlugin', 'You must update the Azure Functions maven plugin for this functionality.'));
        }
    }

    /**
     * Unlike script where templates come from multiple sources (bundle vs non-bundle), java always gets templates from the same source (maven)
     */
    public includeTemplate(): boolean {
        return true;
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    protected async getCacheKeySuffix(): Promise<string> {
        return 'Java';
    }

    private validateGradleProject(): void {
        const buildTool: JavaBuildTool | undefined = getWorkspaceSetting(javaBuildTool, this.getProjectPath());
        if (buildTool === JavaBuildTool.gradle) {
            throw Error('Internal error: Update function template is not supported for gradle project.');
        }
    }

    private getProjectPath(): string {
        if (!this.projectPath) {
            throw new Error(localize('projectMustBeOpen', 'You must have a project open to list Java templates.'));
        } else {
            return this.projectPath;
        }
    }

    protected getResourcesLanguage(): string {
        //always return english since Java templates are only available in english
        return english;
    }
}
