/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from 'vscode-azureextensionui';
import { localize } from '../../localize';
import { cliFeedJsonResponse } from '../../utils/getCliFeedJson';
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
    protected readonly _templatesKey: string = 'JavaFunctionTemplates';
    protected readonly _configKey: string = 'JavaFunctionTemplateConfig';
    protected readonly _resourcesKey: string = 'JavaFunctionTemplateResources';

    public async getLatestTemplates(_cliFeedJson: cliFeedJsonResponse, _templateVersion: string, context: IActionContext): Promise<ITemplates> {
        await mavenUtils.validateMavenInstalled(context);

        const commandResult: string = await mavenUtils.executeMvnCommand(context.telemetry.properties, undefined, undefined, 'azure-functions:list');
        const regExp: RegExp = />> templates begin <<([\S\s]+)^.+INFO.+ >> templates end <<$[\S\s]+>> bindings begin <<([\S\s]+)^.+INFO.+ >> bindings end <<$[\S\s]+>> resources begin <<([\S\s]+)^.+INFO.+ >> resources end <<$/gm;
        const regExpResult: RegExpExecArray | null = regExp.exec(commandResult);
        if (regExpResult && regExpResult.length > 3) {
            this._rawTemplates = (<IRawJavaTemplates>JSON.parse(regExpResult[1])).templates;
            this._rawConfig = <object>JSON.parse(regExpResult[2]);
            this._rawResources = <object[]>JSON.parse(regExpResult[3]);
            return parseScriptTemplates(this._rawResources, this._rawTemplates, this._rawConfig);
        } else {
            throw new Error(localize('oldFunctionPlugin', 'You must update the Azure Functions maven plugin for this functionality.'));
        }
    }
}
