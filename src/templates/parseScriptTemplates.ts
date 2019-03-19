/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isString } from 'util';
import { ProjectLanguage } from '../constants';
import { FunctionConfig } from '../FunctionConfig';
import { IEnumValue, IFunctionSetting, ResourceType, ValueType } from './IFunctionSetting';
import { IFunctionTemplate, TemplateCategory } from './IFunctionTemplate';

/**
 * Describes a script template before it has been parsed
 */
export interface IRawTemplate {
    id: string;
    // tslint:disable-next-line:no-reserved-keywords
    function: {};
    metadata: {
        defaultFunctionName: string;
        name: string;
        language: ProjectLanguage;
        userPrompt?: string[];
        category: TemplateCategory[];
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
export interface IConfig {
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
export interface IResources {
    lang?: { [key: string]: string };
    // Every Resources.json file also contains the english strings
    en: { [key: string]: string };
}

// tslint:disable-next-line:no-any
function getVariableValue(resources: IResources, variables: IVariables, data: string): string {
    if (!isString(data)) {
        // This evaluates to a non-string value in rare cases, in which case we just return the value as-is
        return data;
    }

    const matches: RegExpMatchArray | null = data.match(/\[variables\(\'(.*)\'\)\]/);
    data = matches !== null ? variables[matches[1]] : data;

    return getResourceValue(resources, data);
}

export function getResourceValue(resources: IResources, data: string): string {
    const matches: RegExpMatchArray | null = data.match(/\$(.*)/);
    if (matches === null) {
        return data;
    } else {
        const key: string = matches[1];
        if (resources.lang && resources.lang[key]) {
            return resources.lang[key];
        } else {
            return resources.en[key];
        }
    }
}

function parseScriptSetting(data: object, resources: IResources, variables: IVariables): IFunctionSetting {
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

export function parseScriptTemplate(rawTemplate: IRawTemplate, resources: IResources, commonSettings: IConfig): IScriptFunctionTemplate {
    const commonSettingsMap: { [inBindingType: string]: IFunctionSetting[] | undefined } = {};
    for (const binding of commonSettings.bindings) {
        commonSettingsMap[binding.type] = binding.settings.map((setting: object) => parseScriptSetting(setting, resources, commonSettings.variables));
    }

    const functionConfig: FunctionConfig = new FunctionConfig(rawTemplate.function);

    let language: ProjectLanguage = rawTemplate.metadata.language;
    // The templateApiZip only supports script languages, and thus incorrectly defines 'C#Script' as 'C#', etc.
    switch (language) {
        case ProjectLanguage.CSharp:
            language = ProjectLanguage.CSharpScript;
            break;
        case ProjectLanguage.FSharp:
            language = ProjectLanguage.FSharpScript;
            break;
        // The schema of Java templates is the same as script languages, so put it here.
        case ProjectLanguage.Java:
            language = ProjectLanguage.Java;
            break;
        default:
    }

    const userPromptedSettings: IFunctionSetting[] = [];
    if (rawTemplate.metadata.userPrompt) {
        for (const settingName of rawTemplate.metadata.userPrompt) {
            const settings: IFunctionSetting[] | undefined = commonSettingsMap[functionConfig.inBindingType];
            if (settings) {
                const setting: IFunctionSetting | undefined = settings.find((bs: IFunctionSetting) => bs.name === settingName);
                if (setting) {
                    const functionSpecificDefaultValue: string | undefined = functionConfig.inBinding[setting.name];
                    if (functionSpecificDefaultValue) {
                        // overwrite common default value with the function-specific default value
                        setting.defaultValue = functionSpecificDefaultValue;
                    }
                    userPromptedSettings.push(setting);
                }
            }
        }
    }

    return {
        functionConfig: functionConfig,
        isHttpTrigger: functionConfig.isHttpTrigger,
        id: rawTemplate.id,
        functionType: functionConfig.inBindingType,
        name: getResourceValue(resources, rawTemplate.metadata.name),
        defaultFunctionName: rawTemplate.metadata.defaultFunctionName,
        language: language,
        userPromptedSettings: userPromptedSettings,
        templateFiles: rawTemplate.files,
        categories: rawTemplate.metadata.category
    };
}

export interface IScriptFunctionTemplate extends IFunctionTemplate {
    templateFiles: { [filename: string]: string };
    functionType: string;
    functionConfig: FunctionConfig;
}

/**
 * Parses templates contained in the templateApiZip of the functions cli feed. This contains all 'script' templates, including JavaScript, C#Script, Python, etc.
 * This basically converts the 'raw' templates in the externally defined JSON format to a common and understood format (IFunctionTemplate) used by this extension
 */
export function parseScriptTemplates(rawResources: object, rawTemplates: object[], rawConfig: object): IFunctionTemplate[] {
    const templates: IFunctionTemplate[] = [];
    for (const rawTemplate of rawTemplates) {
        try {
            templates.push(parseScriptTemplate(<IRawTemplate>rawTemplate, <IResources>rawResources, <IConfig>rawConfig));
        } catch (error) {
            // Ignore errors so that a single poorly formed template does not affect other templates
        }
    }
    return templates;
}
