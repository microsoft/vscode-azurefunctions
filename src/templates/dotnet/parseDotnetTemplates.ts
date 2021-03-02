/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { ProjectLanguage, TemplateFilter } from '../../constants';
import { ext } from '../../extensionVariables';
import { FuncVersion, getMajorVersion } from '../../FuncVersion';
import { IBindingSetting, ValueType } from '../IBindingTemplate';
import { IFunctionTemplate, TemplateCategory } from '../IFunctionTemplate';
import { ITemplates } from '../ITemplates';

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
export async function parseDotnetTemplates(rawTemplates: object[], version: FuncVersion): Promise<ITemplates> {
    const functionTemplates: IFunctionTemplate[] = [];
    for (const rawTemplate of rawTemplates) {
        try {
            functionTemplates.push(parseDotnetTemplate(<IRawTemplate>rawTemplate));
        } catch (error) {
            // Ignore errors so that a single poorly formed template does not affect other templates
        }
    }

    const filteredTemplates: IFunctionTemplate[] = filterTemplatesByVersion(functionTemplates, version);
    if (version === FuncVersion.v3) {
        // Fall back to v2 templates since v3 templates still use '2' in the id and it's not clear if/when that'll change
        // https://github.com/microsoft/vscode-azurefunctions/issues/1602
        const v2Templates: IFunctionTemplate[] = filterTemplatesByVersion(functionTemplates, FuncVersion.v2);
        for (const v2Template of v2Templates) {
            if (!filteredTemplates.find(t => normalizeId(t.id) === normalizeId(v2Template.id))) {
                filteredTemplates.push(v2Template);
            }
        }
    }

    await copyCSharpSettingsFromJS(filteredTemplates, version);

    return {
        functionTemplates: filteredTemplates,
        bindingTemplates: [] // CSharp does not support binding templates
    };
}

function filterTemplatesByVersion(templates: IFunctionTemplate[], version: FuncVersion): IFunctionTemplate[] {
    const majorVersion: string = getMajorVersion(version);
    const regExp: RegExp = new RegExp(`^Azure\\.Function\\.(F|C)Sharp\\.(Isolated\\.|)[^\\.]*\\.${majorVersion}\\.x$`, 'i');
    return templates.filter(t => regExp.test(t.id));
}

/**
 * The dotnet templates do not provide the validation and resourceType information that we desire
 * As a workaround, we can check for the exact same JavaScript template/setting and leverage that information
 */
async function copyCSharpSettingsFromJS(csharpTemplates: IFunctionTemplate[], version: FuncVersion): Promise<void> {
    // Use separate telemetry event since we don't want to overwrite C# telemetry with JS telemetry
    await callWithTelemetryAndErrorHandling('copyCSharpSettingsFromJS', async (jsContext: IActionContext) => {
        jsContext.errorHandling.suppressDisplay = true;
        jsContext.telemetry.properties.isActivationEvent = 'true';

        const jsTemplates: IFunctionTemplate[] = await ext.templateProvider.getFunctionTemplates(jsContext, undefined, ProjectLanguage.JavaScript, version, TemplateFilter.All, undefined);
        for (const csharpTemplate of csharpTemplates) {
            const jsTemplate: IFunctionTemplate | undefined = jsTemplates.find((t: IFunctionTemplate) => normalizeId(t.id) === normalizeId(csharpTemplate.id));
            if (jsTemplate) {
                for (const cSharpSetting of csharpTemplate.userPromptedSettings) {
                    const jsSetting: IBindingSetting | undefined = jsTemplate.userPromptedSettings.find((t: IBindingSetting) => normalizeName(t.name) === normalizeName(cSharpSetting.name));
                    if (jsSetting) {
                        cSharpSetting.resourceType = jsSetting.resourceType;
                        cSharpSetting.validateSetting = jsSetting.validateSetting;
                    }
                }
            }
        }
    });
}

/**
 * Converts ids like "Azure.Function.CSharp.QueueTrigger.2.x" or "QueueTrigger-JavaScript" to "queuetrigger"
 */
function normalizeId(id: string): string {
    const match: RegExpMatchArray | null = id.match(/[a-z]+Trigger/i);
    return normalizeName(match ? match[0] : id);
}

function normalizeName(name: string): string {
    return name.toLowerCase().replace(/\s/g, '');
}
