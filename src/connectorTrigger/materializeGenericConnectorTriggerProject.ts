/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { FileType } from 'vscode';
import { type ConnectorTriggerSelection } from './connectorTriggerSelection';
import { ProjectLanguage } from '../constants';
import { localize } from '../localize';
import {
    findConnectorTriggerRegistrations,
    findPollingConnectorBindings,
} from './connectorTriggerBindings';
import {
    getConnectorTriggerEventIdentity,
    type ConnectorTriggerEventIdentity,
    type ConnectorTriggerPayloadModel,
} from './connectorTriggerEventIdentity';
import {
    getConnectorTriggerOutputModelName,
    getCSharpOutputModelDefinition,
    getPythonOutputFieldName,
    getPythonOutputModelDefinition,
    getTypeScriptOutputModelDefinition,
    type ConnectorTriggerOutputMetadata,
    type ConnectorTriggerOutputSchema,
} from './connectorTriggerOutputSchema';
import {
    updateCSharpConnectorExtension,
    updatePythonFunctionsSdk,
} from './ensureConnectorTriggerPollProject';

const connectionSettingName = 'ConnectorNamespace';
const genericSampleSettings = [
    'AzureBlobConnection',
    'AZUREBLOB_TOKEN',
    'Office365Connection',
    'OFFICE365_TOKEN',
    'SharepointConnection',
    'SHAREPOINT_TOKEN',
    'TeamsConnection',
    'TEAMS_TOKEN',
];

export async function materializeGenericConnectorTriggerProject(
    projectPath: string,
    language: string,
    selection: ConnectorTriggerSelection,
    outputMetadata?: ConnectorTriggerOutputMetadata,
): Promise<void> {
    const identity = getConnectorTriggerEventIdentity(
        selection.connectorId,
        selection.operationId,
    );
    switch (language) {
        case ProjectLanguage.CSharp:
            await materializeCSharpProject(
                projectPath,
                identity,
                outputMetadata,
            );
            break;
        case ProjectLanguage.TypeScript:
            await materializeTypeScriptProject(
                projectPath,
                identity,
                outputMetadata,
            );
            break;
        case ProjectLanguage.Python:
            await materializePythonProject(
                projectPath,
                identity,
                outputMetadata,
            );
            break;
        default:
            throw new Error(localize(
                'genericConnectorTriggerLanguageUnsupported',
                'Generic Connector Trigger projects are not supported for language "{0}".',
                language,
            ));
    }

    await writeEventReadme(
        projectPath,
        language,
        selection.connectorId,
        identity,
        outputMetadata,
    );
    const registrations = await findConnectorTriggerRegistrations(projectPath);
    const bindings = await findPollingConnectorBindings(projectPath);
    if (registrations.length !== 1 ||
        registrations[0] !== identity.functionName ||
        bindings.length !== 1 ||
        bindings[0].functionName !== identity.functionName ||
        bindings[0].triggerConfigSettingName !== identity.triggerConfigSettingName) {
        throw new Error(localize(
            'genericConnectorTriggerMaterializationInvalid',
            'The generic Connector Trigger template did not produce exactly one matching Poll trigger.',
        ));
    }
}

async function materializeCSharpProject(
    projectPath: string,
    identity: ConnectorTriggerEventIdentity,
    outputMetadata: ConnectorTriggerOutputMetadata | undefined,
): Promise<void> {
    await updateCSharpConnectorExtension(projectPath);
    const projectFile = await getCSharpProjectFile(projectPath);
    if (identity.payloadModel?.csharp) {
        await addCSharpPackageReference(
            projectFile,
            identity.payloadModel.csharp.packageName,
            identity.payloadModel.csharp.packageVersion,
        );
    }

    const oldSource = path.join(projectPath, 'GenericFunctions.cs');
    if (await AzExtFsExtra.pathExists(oldSource)) {
        await AzExtFsExtra.deleteResource(oldSource, {
            recursive: false,
            useTrash: false,
        });
    }
    await AzExtFsExtra.writeFile(
        path.join(projectPath, identity.csharpFileName),
        getCSharpFunction(identity, outputMetadata),
    );

    const renamedProjectFile = path.join(projectPath, `${identity.pascalName}.csproj`);
    if (path.basename(projectFile).localeCompare(
        path.basename(renamedProjectFile),
        undefined,
        { sensitivity: 'accent' },
    ) === 0) {
        return;
    }
    await AzExtFsExtra.copy(projectFile, renamedProjectFile, { overwrite: false });
    await AzExtFsExtra.deleteResource(projectFile, {
        recursive: false,
        useTrash: false,
    });
}

async function materializeTypeScriptProject(
    projectPath: string,
    identity: ConnectorTriggerEventIdentity,
    outputMetadata: ConnectorTriggerOutputMetadata | undefined,
): Promise<void> {
    const functionsPath = path.join(projectPath, 'src', 'functions');
    if (await AzExtFsExtra.pathExists(functionsPath)) {
        await AzExtFsExtra.deleteResource(functionsPath, {
            recursive: true,
            useTrash: false,
        });
    }
    await AzExtFsExtra.ensureDir(functionsPath);
    await AzExtFsExtra.writeFile(
        path.join(functionsPath, identity.typescriptFileName),
        getTypeScriptFunction(identity, outputMetadata),
    );
    await updateJsonName(
        path.join(projectPath, 'package.json'),
        identity.packageName,
        `${identity.operationId} Connector Trigger`,
        !!identity.payloadModel?.typescript,
    );
    await updatePackageLockName(
        path.join(projectPath, 'package-lock.json'),
        identity.packageName,
    );
    await updateAzureYamlName(projectPath, identity.projectName);
    await removeGenericSampleSettings(projectPath);
}

async function materializePythonProject(
    projectPath: string,
    identity: ConnectorTriggerEventIdentity,
    outputMetadata: ConnectorTriggerOutputMetadata | undefined,
): Promise<void> {
    const functionAppPath = path.join(projectPath, 'function_app.py');
    if (!await AzExtFsExtra.pathExists(functionAppPath)) {
        throw createUnsupportedTemplateError();
    }
    await AzExtFsExtra.writeFile(
        functionAppPath,
        getPythonFunction(identity, outputMetadata),
    );
    await updatePythonFunctionsSdk(projectPath);
    if (identity.payloadModel?.python) {
        await addPythonRequirement(
            projectPath,
            identity.payloadModel.python.packageName,
            identity.payloadModel.python.packageVersion,
        );
    }
    await updateAzureYamlName(projectPath, identity.projectName);
    await removeGenericSampleSettings(projectPath);
}

async function getCSharpProjectFile(projectPath: string): Promise<string> {
    const entries = await AzExtFsExtra.readDirectory(projectPath);
    const projectFile = entries.find(entry =>
        entry.type === FileType.File &&
        entry.name.toLowerCase().endsWith('.csproj'));
    if (!projectFile) {
        throw createUnsupportedTemplateError();
    }
    return path.join(projectPath, projectFile.name);
}

async function addCSharpPackageReference(
    projectFile: string,
    packageName: string,
    packageVersion: string,
): Promise<void> {
    let contents = (await AzExtFsExtra.readFile(projectFile)).toString();
    const existing = new RegExp(
        `<PackageReference\\s+Include="${escapeRegExp(packageName)}"\\s+Version="[^"]+"\\s*/>`,
        'i',
    );
    const reference = `<PackageReference Include="${packageName}" Version="${packageVersion}" />`;
    if (existing.test(contents)) {
        contents = contents.replace(existing, reference);
    } else {
        const connectorReference =
            /(<PackageReference\s+Include="Microsoft\.Azure\.Functions\.Worker\.Extensions\.Connector"[^>]*\/>)/i;
        if (!connectorReference.test(contents)) {
            throw createUnsupportedTemplateError();
        }
        contents = contents.replace(
            connectorReference,
            `$1\n    ${reference}`,
        );
    }
    await AzExtFsExtra.writeFile(projectFile, contents);
}

async function addPythonRequirement(
    projectPath: string,
    packageName: string,
    packageVersion: string,
): Promise<void> {
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    let requirements = (await AzExtFsExtra.readFile(requirementsPath)).toString();
    const lineEnding = requirements.includes('\r\n') ? '\r\n' : '\n';
    const requirement = `${packageName}==${packageVersion}`;
    const pattern = new RegExp(`^${escapeRegExp(packageName)}(?:[<>=!~].*)?$`, 'im');
    requirements = pattern.test(requirements) ?
        requirements.replace(pattern, requirement) :
        `${requirements.trimEnd()}${lineEnding}${requirement}${lineEnding}`;
    await AzExtFsExtra.writeFile(requirementsPath, requirements);
}

async function updateJsonName(
    filePath: string,
    name: string,
    description: string,
    needsGeneratedSdkTypes: boolean,
): Promise<void> {
    const data = JSON.parse((await AzExtFsExtra.readFile(filePath)).toString()) as {
        dependencies?: Record<string, string>;
        description?: string;
        name?: string;
    };
    data.name = name;
    data.description = description;
    if (needsGeneratedSdkTypes) {
        data.dependencies ??= {};
        data.dependencies['@typespec/ts-http-runtime'] = '0.3.9';
    }
    await AzExtFsExtra.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function updatePackageLockName(
    filePath: string,
    name: string,
): Promise<void> {
    if (!await AzExtFsExtra.pathExists(filePath)) {
        return;
    }
    const data = JSON.parse((await AzExtFsExtra.readFile(filePath)).toString()) as {
        name?: string;
        packages?: Record<string, { name?: string }>;
    };
    data.name = name;
    if (data.packages?.['']) {
        data.packages[''].name = name;
    }
    await AzExtFsExtra.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function updateAzureYamlName(
    projectPath: string,
    name: string,
): Promise<void> {
    const azureYamlPath = path.join(projectPath, 'azure.yaml');
    if (!await AzExtFsExtra.pathExists(azureYamlPath)) {
        return;
    }
    const contents = (await AzExtFsExtra.readFile(azureYamlPath)).toString();
    if (!/^name:\s*.+$/m.test(contents)) {
        throw createUnsupportedTemplateError();
    }
    await AzExtFsExtra.writeFile(
        azureYamlPath,
        contents.replace(/^name:\s*.+$/m, `name: ${name}`),
    );
}

async function removeGenericSampleSettings(projectPath: string): Promise<void> {
    const settingsPath = path.join(projectPath, 'local.settings.json');
    if (!await AzExtFsExtra.pathExists(settingsPath)) {
        return;
    }
    const data = JSON.parse((await AzExtFsExtra.readFile(settingsPath)).toString()) as {
        Values?: Record<string, unknown>;
    };
    for (const setting of genericSampleSettings) {
        delete data.Values?.[setting];
    }
    await AzExtFsExtra.writeFile(settingsPath, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeEventReadme(
    projectPath: string,
    language: string,
    connectorId: string,
    identity: ConnectorTriggerEventIdentity,
    outputMetadata: ConnectorTriggerOutputMetadata | undefined,
): Promise<void> {
    const model = identity.payloadModel;
    const outputSchema = model ? undefined : outputMetadata?.schema;
    const payloadDescription = model ?
        `The public connector definition returns \`${model.collectionSchemaName}.value[]\` items typed as \`${model.schemaName}\`.` :
        outputSchema ?
            `The selected connector definition returns \`${outputSchema.schemaName}\` items from \`${outputSchema.collectionPath}\`.` :
            `Output schema ${outputMetadata?.limitation ?? 'definition-unavailable'}; the generated handler retains the language generic payload type.`;
    const languageDescription = getLanguagePayloadDescription(
        language,
        identity,
        model,
        outputSchema,
    );
    await AzExtFsExtra.writeFile(
        path.join(projectPath, 'README.md'),
        `# ${identity.operationId} Connector Trigger

This project was created from the pinned language \`genericApp\` because no specialized sample owns the selected operation.

- Connector: \`${connectorId}\`
- Operation: \`${identity.operationId}\`
- Function registration: \`${identity.functionName}\`
- Trigger configuration setting: \`${identity.triggerConfigSettingName}\`

${payloadDescription}

${languageDescription}

Connector parameters, connection authorization, and Trigger Config resources are not created by this authoring flow. Configure them separately before running the project.
`,
    );
}

function getLanguagePayloadDescription(
    language: string,
    identity: ConnectorTriggerEventIdentity,
    model: ConnectorTriggerPayloadModel | undefined,
    outputSchema: ConnectorTriggerOutputSchema | undefined,
): string {
    if (language === ProjectLanguage.CSharp && model?.csharp) {
        return `The C# binding uses the operation-specific SDK payload \`${model.csharp.payloadType}\` from \`${model.csharp.packageName}\`.`;
    }
    if (language === ProjectLanguage.TypeScript && model?.typescript) {
        return `The TypeScript handler uses \`connectorTrigger<${model.typescript.importName}>\` from \`${model.typescript.importPath}\`.`;
    }
    if (language === ProjectLanguage.Python && model?.python) {
        return `The Python Poll binding receives raw event strings, unwraps \`outputs.body.value[]\`, preserves schema wire casing, and constructs \`${model.python.importName}\` dataclass instances from \`${model.python.packageName}\`.`;
    }
    if (outputSchema) {
        const modelName = getConnectorTriggerOutputModelName(
            identity.pascalName,
            outputSchema,
        );
        if (language === ProjectLanguage.CSharp) {
            return `The C# Connector binding keeps the supported raw string envelope and deserializes \`${outputSchema.collectionPath}\` into local \`${modelName}\` models.`;
        }
        if (language === ProjectLanguage.TypeScript) {
            return `The TypeScript Connector handler types normalized event items as the local \`${modelName}\` interface.`;
        }
        if (language === ProjectLanguage.Python) {
            return `The Python Poll binding keeps its raw event strings, unwraps \`${outputSchema.collectionPath}\`, and constructs local \`${modelName}\` dataclass instances.`;
        }
    }
    return 'The generated handler uses the language generic connector payload without inventing operation-specific fields.';
}

function getCSharpFunction(
    identity: ConnectorTriggerEventIdentity,
    outputMetadata: ConnectorTriggerOutputMetadata | undefined,
): string {
    const csharpModel = identity.payloadModel?.csharp;
    const outputSchema = csharpModel ? undefined : outputMetadata?.schema;
    const localModelName = outputSchema ?
        getConnectorTriggerOutputModelName(identity.pascalName, outputSchema) :
        undefined;
    const modelUsing = csharpModel ? `using ${csharpModel.namespace};\n` : '';
    const schemaUsings = outputSchema ?
        `using System.Collections.Generic;\n` +
        `using System.Text.Json;\n` +
        `using System.Text.Json.Serialization;\n` :
        '';
    const payloadType = csharpModel?.payloadType ?? 'string';
    const runBody = csharpModel ?
        `        logger.LogInformation("${identity.operationId} connector event received.");
        return System.Text.Json.JsonSerializer.Serialize(payload);` :
        outputSchema && localModelName ?
            `${getCSharpLocalRunBody(identity, outputSchema, localModelName)}
        return payload;` :
            `        // Output schema ${outputMetadata?.limitation ?? 'definition-unavailable'}; retaining the raw Connector envelope.
        logger.LogInformation("${identity.operationId} connector event received.");
        return payload;`;
    const helpers = outputSchema && localModelName ?
        getCSharpLocalEnvelopeDefinitions(
            identity,
            outputSchema,
            localModelName,
        ) :
        '';
    const localModel = outputSchema && localModelName ?
        getCSharpOutputModelDefinition(outputSchema, localModelName) :
        '';
    return `${modelUsing}${schemaUsings}using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Connector;
using Microsoft.Extensions.Logging;

namespace ${identity.csharpNamespace};

public sealed class ${identity.csharpClassName}
{
    private readonly ILogger<${identity.csharpClassName}> logger;

    public ${identity.csharpClassName}(ILogger<${identity.csharpClassName}> logger)
    {
        this.logger = logger;
    }

    [Function("${identity.functionName}")]
    [BlobOutput("connector-messages/{rand-guid}.json", Connection = "AzureWebJobsStorage")]
    public string Run(
        [ConnectorTrigger(
            DeliveryMode = ConnectorTriggerDeliveryMode.Poll,
            Connection = "${connectionSettingName}",
            TriggerConfigName = "%${identity.triggerConfigSettingName}%")]
        ${payloadType} payload)
    {
${runBody}
    }
${helpers ? `\n${indentText(helpers, '    ')}\n` : ''}
}

${localModel}
`;
}

function getTypeScriptFunction(
    identity: ConnectorTriggerEventIdentity,
    outputMetadata: ConnectorTriggerOutputMetadata | undefined,
): string {
    const model = identity.payloadModel?.typescript;
    const outputSchema = model ? undefined : outputMetadata?.schema;
    const localModelName = outputSchema ?
        getConnectorTriggerOutputModelName(identity.pascalName, outputSchema) :
        undefined;
    const typeImport = model ?
        `import type { ${model.importName} } from '${model.importPath}';\n` :
        '';
    const itemType = model?.importName ??
        localModelName ??
        `${identity.pascalName}Item`;
    const genericType = model || localModelName ?
        localModelName && outputSchema ?
            `${getTypeScriptOutputModelDefinition(outputSchema, localModelName)}\n\n` :
            '' :
        `type ${itemType} = Record<string, unknown>;\n\n`;
    return `import { InvocationContext } from '@azure/functions';
import {
    connectorTrigger,
    type ConnectorTriggerOptions,
} from '@azure/functions-extensions-connectors';
${typeImport}
${genericType}interface PollConnectorTriggerOptions {
    deliveryMode: 'Poll';
    connection: string;
    triggerConfigName: string;
}

const connectorTriggerOptions = {
    deliveryMode: 'Poll',
    connection: '${connectionSettingName}',
    triggerConfigName: '%${identity.triggerConfigSettingName}%',
    handler: async (context, invocationContext: InvocationContext) => {
        invocationContext.log(
            \`${identity.operationId} received '\${context.items.length}' item(s).\`,
        );
        return context.rawPayload;
    },
} satisfies ConnectorTriggerOptions<${itemType}> & PollConnectorTriggerOptions;

connectorTrigger<${itemType}>(
    '${identity.functionName}',
    connectorTriggerOptions,
);
`;
}

function getPythonFunction(
    identity: ConnectorTriggerEventIdentity,
    outputMetadata: ConnectorTriggerOutputMetadata | undefined,
): string {
    const model = identity.payloadModel?.python;
    const outputSchema = model ? undefined : outputMetadata?.schema;
    const localModelName = outputSchema ?
        getConnectorTriggerOutputModelName(identity.pascalName, outputSchema) :
        undefined;
    const modelImport = model ?
        `from ${model.importPath} import ${model.importName}\n` :
        '';
    const helpers = model ?
        getPythonModelHelpers(model, identity) :
        outputSchema && localModelName ?
            getPythonLocalModelHelpers(outputSchema, identity, localModelName) :
            '';
    const handlerBody = model ?
        `    items: List[${model.importName}] = []\n` +
        `    for item in _normalize_poll_items(payloads):\n` +
        `        event = _to_${identity.pythonFunctionName}_item(item)\n` +
        `        if event is not None:\n` +
        `            items.append(event)\n` +
        `    logging.info("${identity.functionName} received %s typed item(s).", len(items))\n` :
        outputSchema && localModelName ?
            `    items = _normalize_${identity.pythonFunctionName}_items(payloads)\n` +
            `    logging.info("${identity.functionName} received %s typed item(s).", len(items))\n` :
            `    # Output schema ${outputMetadata?.limitation ?? 'definition-unavailable'}; retaining raw Connector envelopes.\n` +
            `    logging.info("${identity.functionName} received %s connector event(s).", len(payloads))\n`;
    const schemaImports = outputSchema ?
        'from dataclasses import dataclass\nfrom typing import Any, Dict, List, Optional\n' :
        '';
    return `# Copyright (c) .NET Foundation. All rights reserved.
# Licensed under the MIT License.

${model ? 'import json\nfrom typing import Any, List\n' : outputSchema ? `import json\n${schemaImports}` : 'from typing import List\n'}
import azure.functions as func
import logging
${modelImport}
app = func.FunctionApp()

${helpers}
@app.function_name(name="${identity.functionName}")
@app.connector_trigger(
    arg_name="payloads",
    delivery_mode=func.DeliveryMode.POLL,
    connection="${connectionSettingName}",
    trigger_config_name="%${identity.triggerConfigSettingName}%",
    cardinality=func.Cardinality.MANY,
    max_batch_size=4,
)
def ${identity.pythonFunctionName}(payloads: List[str]) -> None:
${handlerBody}`;
}

function getPythonModelHelpers(
    model: NonNullable<ConnectorTriggerPayloadModel['python']>,
    identity: ConnectorTriggerEventIdentity,
): string {
    const wireProperties = Object.entries(model.wireProperties)
        .map(([wireName, propertyName]) =>
            `    ${JSON.stringify(wireName)}: ${JSON.stringify(propertyName)},`)
        .join('\n');
    return `_WIRE_PROPERTIES = {
${wireProperties}
}


def _decode_json(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def _normalize_poll_items(payloads: List[str]) -> List[Any]:
    items: List[Any] = []
    for payload in payloads:
        event = _decode_json(payload)
        if not isinstance(event, dict):
            continue
        outputs = event.get("outputs")
        if not isinstance(outputs, dict):
            continue
        body = _decode_json(outputs.get("body"))
        if isinstance(body, dict) and isinstance(body.get("value"), list):
            items.extend(body["value"])
        elif isinstance(body, list):
            items.extend(body)
        elif body is not None:
            items.append(body)
    return items


def _to_${identity.pythonFunctionName}_item(
    item: Any,
) -> ${model.importName} | None:
    if not isinstance(item, dict):
        return None
    values = {
        property_name: item[wire_name]
        for wire_name, property_name in _WIRE_PROPERTIES.items()
        if wire_name in item
    }
    return ${model.importName}(**values)


`;
}

function getCSharpLocalRunBody(
    identity: ConnectorTriggerEventIdentity,
    schema: ConnectorTriggerOutputSchema,
    modelName: string,
): string {
    const getBodyName = `Get${identity.pascalName}Body`;
    if (schema.collectionPath === 'body.value') {
        const responseName = `${identity.pascalName}ResponseBody`;
        return `        var body = ${getBodyName}(payload);
        var response = body.HasValue && body.Value.ValueKind == JsonValueKind.Object ?
            body.Value.Deserialize<${responseName}>() :
            null;
        var items = response?.Value ?? new List<${modelName}>();
        logger.LogInformation("${identity.operationId} received {ItemCount} item(s).", items.Count);`;
    }
    return `        var body = ${getBodyName}(payload);
        var items = body.HasValue && body.Value.ValueKind == JsonValueKind.Array ?
            body.Value.Deserialize<List<${modelName}>>() ?? new List<${modelName}>() :
            new List<${modelName}>();
        logger.LogInformation("${identity.operationId} received {ItemCount} item(s).", items.Count);`;
}

function getCSharpLocalEnvelopeDefinitions(
    identity: ConnectorTriggerEventIdentity,
    schema: ConnectorTriggerOutputSchema,
    modelName: string,
): string {
    const envelopeName = `${identity.pascalName}ConnectorEnvelope`;
    const outputsName = `${identity.pascalName}ConnectorOutputs`;
    const getBodyName = `Get${identity.pascalName}Body`;
    const responseBody = schema.collectionPath === 'body.value' ?
        `
private sealed class ${identity.pascalName}ResponseBody
{
    [JsonPropertyName("value")]
    public List<${modelName}>? Value { get; set; }
}
` :
        '';
    return `private static JsonElement? ${getBodyName}(string payload)
{
    var envelope = JsonSerializer.Deserialize<${envelopeName}>(payload);
    var body = envelope?.Outputs?.Body;
    if (!body.HasValue)
    {
        return null;
    }
    if (body.Value.ValueKind != JsonValueKind.String)
    {
        return body;
    }
    var encodedBody = body.Value.GetString();
    if (string.IsNullOrWhiteSpace(encodedBody))
    {
        return null;
    }
    using var document = JsonDocument.Parse(encodedBody);
    return document.RootElement.Clone();
}

private sealed class ${envelopeName}
{
    [JsonPropertyName("outputs")]
    public ${outputsName}? Outputs { get; set; }
}

private sealed class ${outputsName}
{
    [JsonPropertyName("body")]
    public JsonElement? Body { get; set; }
}
${responseBody}`;
}

function getPythonLocalModelHelpers(
    schema: ConnectorTriggerOutputSchema,
    identity: ConnectorTriggerEventIdentity,
    modelName: string,
): string {
    const constantName = `_${identity.pythonFunctionName.toUpperCase()}_WIRE_PROPERTIES`;
    const wireProperties = schema.properties.map(property =>
        `    ${JSON.stringify(property.name)}: ` +
        `${JSON.stringify(getPythonOutputFieldName(property.name))},`,
    ).join('\n');
    const collection = schema.collectionPath === 'body.value' ?
        `        if isinstance(body, dict) and isinstance(body.get("value"), list):
            raw_items.extend(body["value"])
` :
        `        if isinstance(body, list):
            raw_items.extend(body)
`;
    return `${getPythonOutputModelDefinition(schema, modelName)}


${constantName} = {
${wireProperties}
}


def _decode_${identity.pythonFunctionName}_json(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def _normalize_${identity.pythonFunctionName}_items(
    payloads: List[str],
) -> List[${modelName}]:
    raw_items: List[Any] = []
    for payload in payloads:
        envelope = _decode_${identity.pythonFunctionName}_json(payload)
        if not isinstance(envelope, dict):
            continue
        outputs = envelope.get("outputs")
        if not isinstance(outputs, dict):
            continue
        body = _decode_${identity.pythonFunctionName}_json(outputs.get("body"))
${collection}    return [
        ${modelName}(**{
            property_name: item[wire_name]
            for wire_name, property_name in ${constantName}.items()
            if wire_name in item
        })
        for item in raw_items
        if isinstance(item, dict)
    ]


`;
}

function createUnsupportedTemplateError(): Error {
    return new Error(localize(
        'genericConnectorTriggerTemplateUnsupported',
        'The generic Connector Trigger project template is not supported.',
    ));
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function indentText(value: string, indent: string): string {
    return value.split(/\r?\n/).map(line => `${indent}${line}`).join('\n');
}
