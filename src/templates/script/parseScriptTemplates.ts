/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isString } from 'util';
import { ProjectLanguage, sqlBindingTemplateRegex } from '../../constants';
import { IFunctionBinding, ParsedFunctionJson } from '../../funcConfig/function';
import { localize } from '../../localize';
import { IBindingSetting, IBindingTemplate, IEnumValue, ResourceType, ValueType } from '../IBindingTemplate';
import { IFunctionTemplate, TemplateCategory } from '../IFunctionTemplate';
import { ITemplates } from '../ITemplates';

/**
 * Describes a script template before it has been parsed
 */
export interface IRawTemplate {
    id?: string;
    function?: {};
    metadata?: {
        defaultFunctionName: string;
        name: string;
        language: ProjectLanguage;
        userPrompt?: string[];
        category?: TemplateCategory[];
        categoryStyle?: string;
    };
    files?: { [filename: string]: string };
}

/**
 * Describes a script template setting before it has been parsed
 */
interface IRawSetting {
    name: string;
    value: ValueType;
    label: string;
    help?: string;
    defaultValue?: string;
    required?: boolean;
    resource?: ResourceType;
    validators?: {
        expression: string;
        errorText: string;
    }[];
    enum?: {
        value: string;
        display: string;
    }[];
}

interface IRawBinding {
    type?: string;
    documentation: string;
    displayName: string;
    direction: string;
    settings?: IRawSetting[];
}

/**
 * Describes script template config to be used for parsing
 */
export interface IConfig {
    variables: IVariables;
    bindings?: IRawBinding[];
}

/**
 * Describes script template variables to be used for parsing
 */
interface IVariables { [name: string]: string; }

/**
 * Describes script template resources to be used for parsing
 */
export interface IResources {
    lang?: { [key: string]: string | undefined };
    // Every Resources.json file also contains the english strings
    en: { [key: string]: string | undefined };
}

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
        const result: string | undefined = resources.lang && resources.lang[key] ? resources.lang[key] : resources.en[key];
        if (result === undefined) {
            throw new Error(localize('resourceNotFound', 'Resource "{0}" not found.', data));
        } else {
            return result;
        }
    }
}

function parseScriptSetting(data: object, resources: IResources, variables: IVariables): IBindingSetting {
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
        description: rawSetting.help ? replaceHtmlLinkWithMarkdown(getResourceValue(resources, rawSetting.help)) : undefined,
        defaultValue: rawSetting.defaultValue,
        label: getVariableValue(resources, variables, rawSetting.label),
        enums: enums,
        required: rawSetting.required,
        validateSetting: (value: string | undefined): string | undefined => {
            if (rawSetting.validators) {
                for (const validator of rawSetting.validators) {
                    if (!value || value.match(validator.expression) === null) {
                        return replaceHtmlLinkWithMarkdown(getVariableValue(resources, variables, validator.errorText));
                    }
                }
            }

            return undefined;
        }
    };
}

function replaceHtmlLinkWithMarkdown(text: string): string {
    const match: RegExpMatchArray | null = text.match(/<a[^>]*href=['"]([^'"]*)['"][^>]*>([^<]*)<\/a>/i);
    if (match) {
        return text.replace(match[0], `[${match[2]}](${match[1]})`);
    } else {
        return text;
    }
}

export function parseScriptBindings(config: IConfig, resources: IResources): IBindingTemplate[] {
    const result: IBindingTemplate[] = [];
    if (config.bindings) {
        for (const rawBinding of config.bindings) {
            try {
                if (rawBinding.type) {
                    const settings: IBindingSetting[] = (rawBinding.settings || []).map((setting: object) => parseScriptSetting(setting, resources, config.variables));
                    result.push({
                        direction: rawBinding.direction,
                        displayName: getResourceValue(resources, rawBinding.displayName),
                        isHttpTrigger: /^http/i.test(rawBinding.type),
                        isTimerTrigger: /^timer/i.test(rawBinding.type),
                        settings,
                        type: rawBinding.type
                    });
                }
            } catch {
                // Ignore errors so that a single poorly formed binding does not affect other bindings
            }
        }
    }
    return result;
}

export function parseScriptTemplate(rawTemplate: IRawTemplate, resources: IResources, bindingTemplates: IBindingTemplate[]): IScriptFunctionTemplate | undefined {
    if (!rawTemplate.id || !rawTemplate.metadata) {
        return undefined;
    }

    const functionJson: ParsedFunctionJson = new ParsedFunctionJson(rawTemplate.function);

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

    const userPromptedSettings: IBindingSetting[] = [];
    if (rawTemplate.metadata.userPrompt) {
        for (const settingName of rawTemplate.metadata.userPrompt) {
            if (functionJson.triggerBinding) {
                const triggerBinding: IFunctionBinding = functionJson.triggerBinding;
                const bindingTemplate: IBindingTemplate | undefined = bindingTemplates.find(b => b.type.toLowerCase() === triggerBinding.type?.toLowerCase());
                if (bindingTemplate) {
                    const setting: IBindingSetting | undefined = bindingTemplate.settings.find((bs: IBindingSetting) => bs.name === settingName);
                    if (setting) {
                        const functionSpecificDefaultValue = triggerBinding[setting.name];
                        if (functionSpecificDefaultValue) {
                            // overwrite common default value with the function-specific default value
                            setting.defaultValue = functionSpecificDefaultValue;
                        }
                        userPromptedSettings.push(setting);
                    }
                }
            }
        }
    }

    return {
        functionJson,
        isHttpTrigger: functionJson.isHttpTrigger,
        isTimerTrigger: functionJson.isTimerTrigger,
        isSqlBindingTemplate: sqlBindingTemplateRegex.test(rawTemplate.id),
        id: rawTemplate.id,
        name: getResourceValue(resources, rawTemplate.metadata.name),
        defaultFunctionName: rawTemplate.metadata.defaultFunctionName,
        language,
        userPromptedSettings,
        templateFiles: rawTemplate.files || {},
        categories: rawTemplate.metadata.category || [],
        categoryStyle: rawTemplate.metadata.categoryStyle,
        isDynamicConcurrent: (rawTemplate.id.includes('ServiceBusQueueTrigger') || rawTemplate.id.includes('BlobTrigger') || rawTemplate.id.includes('QueueTrigger')) ? true : false
    };
}

export interface IScriptFunctionTemplate extends IFunctionTemplate {
    templateFiles: { [filename: string]: string };
    functionJson: ParsedFunctionJson;
}

/**
 * Parses templates contained in the templateApiZip of the functions cli feed. This contains all 'script' templates, including JavaScript, C#Script, Python, etc.
 * This basically converts the 'raw' templates in the externally defined JSON format to a common and understood format (IFunctionTemplate) used by this extension
 */
export function parseScriptTemplates(rawResources: object, rawTemplates: object[], rawConfig: object): ITemplates {
    const bindingTemplates: IBindingTemplate[] = parseScriptBindings(<IConfig>rawConfig, <IResources>rawResources);

    const functionTemplates: IFunctionTemplate[] = [];
    for (const rawTemplate of rawTemplates) {
        try {
            const parsed: IScriptFunctionTemplate | undefined = parseScriptTemplate(<IRawTemplate>rawTemplate, <IResources>rawResources, bindingTemplates);
            if (parsed) {
                functionTemplates.push(parsed);
            }
        } catch {
            // Ignore errors so that a single poorly formed template does not affect other templates
        }
    }

    return { functionTemplates, bindingTemplates };
}
