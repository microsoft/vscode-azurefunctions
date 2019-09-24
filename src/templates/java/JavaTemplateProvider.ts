/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parseError, TelemetryProperties } from 'vscode-azureextensionui';
import { ProjectLanguage } from '../constants';
import { mavenUtils } from "../utils/mavenUtils";
import { IBindingTemplate } from './IBindingTemplate';
import { IFunctionTemplate } from './IFunctionTemplate';
import { IConfig, IRawTemplate, IResources, parseScriptBindings, parseScriptTemplate as parseJavaTemplate } from './parseScriptTemplates';
import { removeLanguageFromId } from "./TemplateProvider";

/**
 * Describes templates output before it has been parsed
 */
interface IRawJavaTemplates {
    templates: IRawTemplate[];
}

const backupJavaTemplateNames: string[] = [
    'HttpTrigger',
    'BlobTrigger',
    'QueueTrigger',
    'TimerTrigger'
];

/**
 * Parses templates contained in the output of 'mvn azure-functions:list'.
 * This basically converts the 'raw' templates in the externally defined JSON format to a common and understood format (IFunctionTemplate) used by this extension
 */
export async function parseJavaTemplates(allTemplates: IFunctionTemplate[], functionAppPath: string, telemetryProperties?: TelemetryProperties): Promise<IFunctionTemplate[]> {
    let embeddedTemplates: IRawJavaTemplates = { templates: [] };
    let embeddedConfig: IConfig | undefined;
    let embeddedResources: object = {};
    try {
        // Try to get the templates information by calling 'mvn azure-functions:list'.
        const commandResult: string = await mavenUtils.executeMvnCommand(telemetryProperties, undefined, functionAppPath, 'azure-functions:list');
        const regExp: RegExp = />> templates begin <<([\S\s]+)^.+INFO.+ >> templates end <<$[\S\s]+>> bindings begin <<([\S\s]+)^.+INFO.+ >> bindings end <<$[\S\s]+>> resources begin <<([\S\s]+)^.+INFO.+ >> resources end <<$/gm;
        const regExpResult: RegExpExecArray | null = regExp.exec(commandResult);
        if (regExpResult && regExpResult.length > 3) {
            embeddedTemplates = <IRawJavaTemplates>JSON.parse(regExpResult[1]);
            embeddedConfig = <IConfig>JSON.parse(regExpResult[2]);
            embeddedResources = <object[]>JSON.parse(regExpResult[3]);
        }
    } catch (error) {
        // Swallow the exception if the plugin do not support list templates information.
        if (telemetryProperties) {
            telemetryProperties.parseJavaTemplateErrors = parseError(error).message;
        }
    }

    const templates: IFunctionTemplate[] = [];
    if (embeddedConfig) {
        const bindings: IBindingTemplate[] = parseScriptBindings(embeddedConfig, <IResources>embeddedResources);
        for (const template of embeddedTemplates.templates) {
            try {
                templates.push(parseJavaTemplate(template, <IResources>embeddedResources, bindings));
            } catch (error) {
                // Ignore errors so that a single poorly formed template does not affect other templates
            }
        }
    }

    if (templates.length > 0) {
        return templates;
    } else {
        // If the templates.length is 0, this means that the user is using an older version of Maven function plugin,
        // which do not have the functionality to provide the template information.
        // For this kind of scenario, we will fallback to leverage the JavaScript templates.
        const javaScriptTemplates: IFunctionTemplate[] = allTemplates.filter((t: IFunctionTemplate) => t.language === ProjectLanguage.JavaScript);
        return javaScriptTemplates.filter((t: IFunctionTemplate) => backupJavaTemplateNames.find((vt: string) => vt === removeLanguageFromId(t.id)));
    }
}
