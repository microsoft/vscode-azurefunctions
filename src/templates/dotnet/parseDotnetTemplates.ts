/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectLanguage, ProjectRuntime } from '../constants';
import { IBindingSetting, ValueType } from './IBindingTemplate';
import { IFunctionTemplate, TemplateCategory } from './IFunctionTemplate';

/**
 * Describes a dotnet template before it has been parsed
 */
interface IRawTemplate {
    DefaultName: string;
    Name: string;
    Identity: string;
    Parameters: {}[];
}

/**
 * Describes a dotnet template setting before it has been parsed
 */
interface IRawSetting {
    Documentation: string | undefined;
    Name: string;
    DefaultValue: string | undefined;
    DataType: string | undefined;
    Choices: {
        [key: string]: string;
    } | undefined;
}

function parseDotnetSetting(rawSetting: IRawSetting): IBindingSetting {
    return {
        name: rawSetting.Name,
        resourceType: undefined, // Dotnet templates do not give us resourceType information
        valueType: rawSetting.DataType === 'choice' ? ValueType.enum : ValueType.string,
        defaultValue: rawSetting.DefaultValue,
        required: true, // Dotnet templates do not give us this information. Assume it's required
        label: rawSetting.Name,
        description: rawSetting.Documentation,
        enums: rawSetting.Choices ? Object.keys(rawSetting.Choices).map((key: string) => { return { value: key, displayName: key }; }) : [],
        validateSetting: (): undefined => { return undefined; } // Dotnet templates do not give us validation information
    };
}

function parseDotnetTemplate(rawTemplate: IRawTemplate): IFunctionTemplate {
    const userPromptedSettings: IBindingSetting[] = [];
    for (const rawSetting of rawTemplate.Parameters) {
        const setting: IBindingSetting = parseDotnetSetting(<IRawSetting>rawSetting);
        // Exclude some of the default parameters like 'name' and 'namespace' that apply for every function and are handled separately
        if (!/^(name|namespace|type|language)$/i.test(setting.name)) {
            userPromptedSettings.push(setting);
        }
    }

    return {
        isHttpTrigger: /^http/i.test(rawTemplate.Name) || /webhook$/i.test(rawTemplate.Name),
        isTimerTrigger: /^timer/i.test(rawTemplate.Name),
        id: rawTemplate.Identity,
        name: rawTemplate.Name,
        defaultFunctionName: rawTemplate.DefaultName,
        language: /FSharp/i.test(rawTemplate.Identity) ? ProjectLanguage.FSharp : ProjectLanguage.CSharp,
        userPromptedSettings: userPromptedSettings,
        categories: [TemplateCategory.Core] // Dotnet templates do not have category information, so display all templates as if they are in the 'core' category
    };
}

/**
 * Parses templates used by the .NET CLI
 * This basically converts the 'raw' templates in the externally defined JSON format to a common and understood format (IFunctionTemplate) used by this extension
 */
export function parseDotnetTemplates(rawTemplates: object[], runtime: ProjectRuntime): IFunctionTemplate[] {
    const templates: IFunctionTemplate[] = [];
    for (const rawTemplate of rawTemplates) {
        try {
            const template: IFunctionTemplate = parseDotnetTemplate(<IRawTemplate>rawTemplate);
            if (/^Azure\.Function\.(F|C)Sharp\./i.test(template.id) &&
                ((runtime === ProjectRuntime.v1 && template.id.includes('1')) || (runtime === ProjectRuntime.v2 && template.id.includes('2')))) {
                templates.push(template);
            }
        } catch (error) {
            // Ignore errors so that a single poorly formed template does not affect other templates
        }
    }
    return templates;
}
