/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectLanguage, ProjectRuntime } from '../constants';
import { IFunctionSetting, ValueType } from './IFunctionSetting';
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

function parseDotnetSetting(rawSetting: IRawSetting): IFunctionSetting {
    return {
        name: rawSetting.Name,
        resourceType: undefined, // Dotnet templates do not give us resourceType information
        valueType: rawSetting.DataType === 'choice' ? ValueType.enum : ValueType.string,
        defaultValue: rawSetting.DefaultValue,
        label: rawSetting.Name,
        description: rawSetting.Documentation,
        enums: rawSetting.Choices ? Object.keys(rawSetting.Choices).map((key: string) => { return { value: key, displayName: key }; }) : [],
        validateSetting: (): undefined => { return undefined; } // Dotnet templates do not give us validation information
    };
}

function parseDotnetTemplate(rawTemplate: IRawTemplate): IFunctionTemplate {
    const userPromptedSettings: IFunctionSetting[] = [];
    for (const rawSetting of rawTemplate.Parameters) {
        const setting: IFunctionSetting = parseDotnetSetting(<IRawSetting>rawSetting);
        // Exclude some of the default parameters like 'name' and 'namespace' that apply for every function and are handled separately
        if (!/^(name|namespace|type|language)$/i.test(setting.name)) {
            userPromptedSettings.push(setting);
        }
    }

    return {
        isHttpTrigger: rawTemplate.Name.toLowerCase().startsWith('http') || rawTemplate.Name.toLowerCase().endsWith('webhook'),
        id: rawTemplate.Identity,
        name: rawTemplate.Name,
        defaultFunctionName: rawTemplate.DefaultName,
        language: ProjectLanguage.CSharp,
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
            if (template.id.startsWith('Azure.Function.CSharp.') &&
                ((runtime === ProjectRuntime.one && template.id.includes('1')) || (runtime === ProjectRuntime.beta && template.id.includes('2')))) {
                templates.push(template);
            }
        } catch (error) {
            // Ignore errors so that a single poorly formed template does not affect other templates
        }
    }
    return templates;
}
