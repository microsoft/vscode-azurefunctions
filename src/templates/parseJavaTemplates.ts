/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SemVer } from 'semver';
import { isString } from 'util';
import { parseError, TelemetryProperties } from 'vscode-azureextensionui';
import { ProjectLanguage, ProjectRuntime } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { mavenPluginVersionCache } from '../utils/mavenPluginVersionCache';
import { mavenUtils } from "../utils/mavenUtils";
import { removeLanguageFromId } from "./FunctionTemplates";
import { IEnumValue, IFunctionSetting, ResourceType, ValueType } from './IFunctionSetting';
import { IFunctionTemplate, TemplateCategory } from './IFunctionTemplate';

/**
 * Describes a script template before it has been parsed
 */
interface IRawTemplate {
    id: string;
    metadata: {
        defaultFunctionName: string;
        name: string;
        language: ProjectLanguage;
        userPrompt?: string[];
        bindingType: string;
    };
    files: { [filename: string]: string };
}

/**
 * Describes a script template setting before it has been parsed
 */
interface IRawSetting {
    name: string;
    value: ValueType;
    label: string;
    defaultValue?: string;
    required: boolean;
    resource?: ResourceType;
    validators?: {
        expression: string;
        errorText: string;
    }[];
    // tslint:disable-next-line:no-reserved-keywords
    enum?: {
        value: string;
        display: string;
    }[];
}

/**
 * Describes script template config to be used for parsing
 */
interface IConfig {
    variables: IVariables;
    bindings: {
        // tslint:disable-next-line:no-reserved-keywords
        type: string;
        settings: object[];
    }[];
}

/**
 * Describes script template variables to be used for parsing
 */
interface IVariables { [name: string]: string; }

/**
 * Describes script template resources to be used for parsing
 */
interface IResources { en: { [key: string]: string }; }

const basicJavaTemplateNames: string[] = [
    'HttpTrigger',
    'BlobTrigger',
    'QueueTrigger',
    'TimerTrigger'
];

function parseScriptTemplate(rawTemplate: IRawTemplate, resources: IResources, commonSettings: IConfig): IFunctionTemplate {
    const commonSettingsMap: { [inBindingType: string]: IFunctionSetting[] | undefined } = {};
    for (const binding of commonSettings.bindings) {
        commonSettingsMap[binding.type.toLowerCase()] = binding.settings.map((setting: object) => parseSetting(setting, resources, commonSettings.variables));
    }

    const userPromptedSettings: IFunctionSetting[] = [];
    if (rawTemplate.metadata.userPrompt) {
        for (const settingName of rawTemplate.metadata.userPrompt) {
            const settings: IFunctionSetting[] | undefined = commonSettingsMap[rawTemplate.metadata.bindingType.toLowerCase()];
            if (settings) {
                const setting: IFunctionSetting | undefined = settings.find((bs: IFunctionSetting) => bs.name === settingName);
                if (setting) {
                    userPromptedSettings.push(setting);
                }
            }
        }
    }

    return {
        isHttpTrigger: rawTemplate.id.toLowerCase().startsWith('httptrigger'),
        id: rawTemplate.id,
        name: getResourceValue(resources, rawTemplate.metadata.name),
        defaultFunctionName: rawTemplate.metadata.defaultFunctionName,
        language: ProjectLanguage.Java,
        userPromptedSettings: userPromptedSettings,
        categories: [TemplateCategory.Core]
    };
}

function parseSetting(data: object, resources: IResources, variables: IVariables): IFunctionSetting {
    const rawSetting: IRawSetting = <IRawSetting>data;
    const enums: IEnumValue[] = [];
    if (rawSetting.enum) {
        for (const ev of rawSetting.enum) {
            enums.push({
                value: getVariableValue(resources, variables, ev.value),
                displayName: getVariableValue(resources, variables, ev.display)
            });
        }
    }

    return {
        name: getVariableValue(resources, variables, rawSetting.name),
        resourceType: rawSetting.resource,
        valueType: rawSetting.value,
        defaultValue: rawSetting.defaultValue ? getVariableValue(resources, variables, rawSetting.defaultValue) : undefined,
        label: getVariableValue(resources, variables, rawSetting.label),
        enums: enums,
        validateSetting: (value: string | undefined): string | undefined => {
            if (rawSetting.validators) {
                for (const validator of rawSetting.validators) {
                    if (!value || value.match(validator.expression) === null) {
                        return getVariableValue(resources, variables, validator.errorText);
                    }
                }
            }

            return undefined;
        }
    };
}

function getVariableValue(resources: IResources, variables: IVariables, data: string): string {
    if (!isString(data)) {
        // This evaluates to a non-string value in rare cases, in which case we just return the value as-is
        return data;
    }

    const matches: RegExpMatchArray | null = data.match(/\[variables\(\'(.*)\'\)\]/);
    data = matches !== null ? variables[matches[1]] : data;

    return getResourceValue(resources, <string>data);
}

function getResourceValue(resources: IResources, data: string): string {
    const matches: RegExpMatchArray | null = data.match(/\$(.*)/);
    return matches !== null ? resources.en[matches[1]] : data;
}

export async function parseJavaTemplates(allTemplates: IFunctionTemplate[], functionAppPath?: string, telemetryProperties?: TelemetryProperties): Promise<IFunctionTemplate[]> {
    const javaScriptTemplates: IFunctionTemplate[] = allTemplates.filter((t: IFunctionTemplate) => t.language === ProjectLanguage.JavaScript);
    // Currently we leverage JS Script templates to get the function metadata of Java Functions.
    // Will refactor the code here when templates HTTP API is ready.
    // See issue here: https://github.com/Microsoft/vscode-azurefunctions/issues/84
    const basicJavaTemplates: IFunctionTemplate[] = javaScriptTemplates.filter((t: IFunctionTemplate) => basicJavaTemplateNames.find((vt: string) => vt === removeLanguageFromId(t.id)));
    const mavenPluginVersionString: string | null = mavenPluginVersionCache.getPluginVersion(functionAppPath);
    if (!functionAppPath || mavenPluginVersionString === null) {
        // MavenPluginVersionCache is still resolving the version information, return verified templates.
        return basicJavaTemplates;
    } else if (mavenPluginVersionString === '') {
        throw new Error(localize('azFunc.invalidMavenFunctionPlugin', 'Failed to resolve Maven Azure Functions plugin in pom, please make sure "mvn" is in PATH and the project is a valid Java Azure Functions project'));
    } else {
        if (telemetryProperties) {
            telemetryProperties.pluginVersion = mavenPluginVersionString;
        }
        const mavenPluginVersion: SemVer = new SemVer(mavenPluginVersionString);
        if (mavenPluginVersion.compare(new SemVer('1.0.0-beta-4')) <= 0) {
            return basicJavaTemplates;
        } else {
            let embeddedTemplates: object[] = [];
            try {
                const commandResult: string = await mavenUtils.executeMvnCommand(undefined, undefined, functionAppPath, 'azure-functions:list');
                const regExp: RegExp = /(?:>> templates begin <<$)([\S\s]+)(?:^\[INFO\] >> templates end <<)/gm;
                const regExpResult: RegExpExecArray | null = regExp.exec(commandResult);
                if (regExpResult && regExpResult.length > 1) {
                    embeddedTemplates = JSON.parse(regExpResult[1]);
                }
            } catch (error) {
                if (telemetryProperties) {
                    telemetryProperties.parseJavaTemplateErrors = parseError(error).message;
                }
            }
            const templates: IFunctionTemplate[] = [];
            const cachedResources: object | undefined = ext.context.globalState.get<object>(`FunctionTemplateResources.${ProjectRuntime.beta}`);
            const cachedConfig: object | undefined = ext.context.globalState.get<object>(`FunctionTemplateConfig.${ProjectRuntime.beta}`);
            for (const template of embeddedTemplates) {
                try {
                    templates.push(parseScriptTemplate(<IRawTemplate>template, <IResources>cachedResources, <IConfig>cachedConfig));
                } catch (error) {
                    // Ignore errors so that a single poorly formed template does not affect other templates
                }
            }
            return templates.length ? templates : basicJavaTemplates;
        }
    }
}
