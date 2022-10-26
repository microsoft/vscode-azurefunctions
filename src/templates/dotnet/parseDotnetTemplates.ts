/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, IActionContext } from '@microsoft/vscode-azext-utils';
import { ProjectLanguage, sqlBindingTemplateRegex, TemplateFilter } from '../../constants';
import { ext } from '../../extensionVariables';
import { FuncVersion } from '../../FuncVersion';
import { localize } from '../../localize';
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
    let valueType: ValueType;
    switch (rawSetting.DataType?.toLowerCase()) {
        case 'choice':
            valueType = ValueType.enum;
            break;
        case 'bool':
            valueType = ValueType.boolean;
            break;
        default:
            valueType = ValueType.string;
    }

    return {
        name: rawSetting.Name,
        resourceType: undefined, // Dotnet templates do not give us resourceType information
        valueType,
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
        isSqlBindingTemplate: sqlBindingTemplateRegex.test(rawTemplate.Name),
        id: rawTemplate.Identity,
        name: rawTemplate.Name,
        defaultFunctionName: rawTemplate.DefaultName,
        language: /FSharp/i.test(rawTemplate.Identity) ? ProjectLanguage.FSharp : ProjectLanguage.CSharp,
        userPromptedSettings: userPromptedSettings,
        categories: [TemplateCategory.Core], // Dotnet templates do not have category information, so display all templates as if they are in the 'core' category
        isDynamicConcurrent: (rawTemplate.Identity.includes('ServiceBusQueueTrigger') || rawTemplate.Identity.includes('BlobTrigger') || rawTemplate.Identity.includes('QueueTrigger')) ? true : false
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

    await copyCSharpSettingsFromJS(functionTemplates, version);

    return {
        functionTemplates,
        bindingTemplates: [] // CSharp does not support binding templates
    };
}

/**
 * The dotnet templates do not provide the validation, resourceType, and display information that we desire
 * As a workaround, we can check for the exact same JavaScript template/setting and leverage that information
 */
async function copyCSharpSettingsFromJS(csharpTemplates: IFunctionTemplate[], version: FuncVersion): Promise<void> {
    // Use separate telemetry event since we don't want to overwrite C# telemetry with JS telemetry
    await callWithTelemetryAndErrorHandling('copyCSharpSettingsFromJS', async (jsContext: IActionContext) => {
        jsContext.errorHandling.suppressDisplay = true;
        jsContext.telemetry.properties.isActivationEvent = 'true';

        const templateProvider = ext.templateProvider.get(jsContext);
        const jsTemplates: IFunctionTemplate[] = await templateProvider.getFunctionTemplates(jsContext, undefined, ProjectLanguage.JavaScript, undefined, version, TemplateFilter.All, undefined);
        for (const csharpTemplate of csharpTemplates) {
            const normalizedDotnetId = normalizeDotnetId(csharpTemplate.id);
            const jsTemplate: IFunctionTemplate | undefined = jsTemplates.find((t: IFunctionTemplate) => normalizeScriptId(t.id) === normalizedDotnetId);
            if (jsTemplate) {
                csharpTemplate.name = jsTemplate.name;
                csharpTemplate.defaultFunctionName = jsTemplate.defaultFunctionName;
                for (const cSharpSetting of csharpTemplate.userPromptedSettings) {
                    const jsSetting: IBindingSetting | undefined = jsTemplate.userPromptedSettings.find((t: IBindingSetting) => normalizeName(t.name) === normalizeName(cSharpSetting.name));
                    if (jsSetting) {
                        cSharpSetting.resourceType = jsSetting.resourceType;
                        cSharpSetting.validateSetting = jsSetting.validateSetting;
                    }
                }
            } else {
                // Verified templates without a matching JS template
                switch (normalizedDotnetId) {
                    case 'httpwithopenapi':
                        csharpTemplate.name = localize('httpWithOpenApiName', 'HTTP trigger with OpenAPI');
                        break;
                    case 'durablefunctionsorchestration':
                        csharpTemplate.name = localize('durableFunctionsOrchestrationName', 'Durable Functions Orchestration');
                        break;
                }
            }
        }
    });
}

/**
 * Converts ids like "Azure.Function.CSharp.QueueTrigger.2.x" to "queue"
 */
function normalizeDotnetId(id: string): string {
    const match: RegExpMatchArray | null = id.match(/^azure\.function\.(?:c|f)sharp\.(?:isolated\.|)([a-z]+)\./i);
    return normalizeName(match ? match[1] : id);
}

/**
 * Converts ids like "QueueTrigger-JavaScript" to "queue"
 */
function normalizeScriptId(id: string): string {
    const match: RegExpMatchArray | null = id.match(/^([a-z]+)-/i);
    return normalizeName(match ? match[1] : id);
}

function normalizeName(name: string): string {
    return name.toLowerCase().replace(/\s/g, '').replace(/trigger/i, '');
}
