/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fse from 'fs-extra';
import * as path from 'path';
import { IActionContext } from 'vscode-azureextensionui';
import { localize } from '../../localize';
import { mavenUtils } from '../../utils/mavenUtils';
import { ITemplates } from '../ITemplates';
import { parseScriptTemplates } from '../script/parseScriptTemplates';
import { ScriptTemplateProvider } from '../script/ScriptTemplateProvider';
import { TemplateType } from '../TemplateProviderBase';

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
    protected readonly _backupSubpath: string = 'backupJavaTemplates';

    public async getLatestTemplateVersion(): Promise<string> {
        const pomPath: string = path.join(this.getProjectPath(), 'pom.xml');
        const pomContents: string = (await fse.readFile(pomPath)).toString();
        const match: RegExpMatchArray | null = pomContents.match(/<azure.functions.maven.plugin.version>(.*)<\/azure.functions.maven.plugin.version>/i);
        if (!match) {
            throw new Error(localize('failedToDetectPluginVersion', 'Failed to detect Azure Functions maven plugin version.'));
        } else {
            return match[1].trim();
        }
    }

    public async getLatestTemplates(context: IActionContext): Promise<ITemplates> {
        await mavenUtils.validateMavenInstalled(context);

        const projectPath: string = this.getProjectPath();
        const commandResult: string = await mavenUtils.executeMvnCommand(context.telemetry.properties, undefined, projectPath, 'azure-functions:list');
        const regExp: RegExp = />> templates begin <<([\S\s]+)^.+INFO.+ >> templates end <<$[\S\s]+>> bindings begin <<([\S\s]+)^.+INFO.+ >> bindings end <<$[\S\s]+>> resources begin <<([\S\s]+)^.+INFO.+ >> resources end <<$/gm;
        const regExpResult: RegExpExecArray | null = regExp.exec(commandResult);
        if (regExpResult && regExpResult.length > 3) {
            this._rawTemplates = (<IRawJavaTemplates>JSON.parse(regExpResult[1])).templates;
            this._rawBindings = <object>JSON.parse(regExpResult[2]);
            this._rawResources = <object[]>JSON.parse(regExpResult[3]);
            return parseScriptTemplates(this._rawResources, this._rawTemplates, this._rawBindings);
        } else {
            throw new Error(localize('oldFunctionPlugin', 'You must update the Azure Functions maven plugin for this functionality.'));
        }
    }

    protected async getCacheKeySuffix(): Promise<string> {
        return 'Java';
    }

    private getProjectPath(): string {
        if (!this.projectPath) {
            throw new Error(localize('projectMustBeOpen', 'You must have a project open to list Java templates.'));
        } else {
            return this.projectPath;
        }
    }
}
