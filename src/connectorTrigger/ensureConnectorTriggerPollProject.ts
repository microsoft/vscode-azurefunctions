/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { FileType } from 'vscode';
import { ProjectLanguage, requirementsFileName } from '../constants';
import { localize } from '../localize';
import {
    findConnectorTriggerRegistrations,
    findPollingConnectorBindings,
} from './connectorTriggerBindings';
import {
    getConnectorTriggerEventIdentity,
    type ConnectorTriggerEventIdentity,
} from './connectorTriggerEventIdentity';
import { type ConnectorTriggerProjectHandoff } from './connectorTriggerProjectHandoff';
import {
    getConnectorTriggerOutputModelName,
    getCSharpOutputModelDefinition,
    getPythonOutputFieldName,
    getPythonOutputModelDefinition,
    getTypeScriptOutputModelDefinition,
    type ConnectorTriggerOutputMetadata,
    type ConnectorTriggerOutputSchema,
} from './connectorTriggerOutputSchema';

const connectionSettingName = 'ConnectorNamespace';

interface AvailableConnectorIdentity {
    alreadyExists: boolean;
    identity: ConnectorTriggerEventIdentity;
    instance: number;
}

export async function ensureConnectorTriggerPollProject(
    projectPath: string,
    language: string,
    handoff: ConnectorTriggerProjectHandoff,
    outputMetadata?: ConnectorTriggerOutputMetadata,
): Promise<void> {
    const available = await getAvailableConnectorIdentity(
        projectPath,
        language,
        handoff,
    );
    switch (language) {
        case ProjectLanguage.CSharp:
            await ensureCSharpProject(projectPath, available, outputMetadata);
            return;
        case ProjectLanguage.TypeScript:
            await ensureTypeScriptProject(projectPath, available, outputMetadata);
            return;
        case ProjectLanguage.Python:
            await ensurePythonProject(projectPath, available, outputMetadata);
            return;
        default:
            throw new Error(localize(
                'connectorTriggerPollLanguageUnsupported',
                'Connector Trigger Poll projects are not supported for language "{0}".',
                language,
            ));
    }
}

async function getAvailableConnectorIdentity(
    projectPath: string,
    language: string,
    handoff: ConnectorTriggerProjectHandoff,
): Promise<AvailableConnectorIdentity> {
    const registrations = await findConnectorTriggerRegistrations(projectPath);
    const bindings = await findPollingConnectorBindings(projectPath);
    const baseIdentity = getConnectorTriggerEventIdentity(
        handoff.connectorId,
        handoff.operationId,
    );
    const matchingBindings = bindings.filter(binding =>
        equalsIgnoreCase(binding.functionName, baseIdentity.functionName));
    if (matchingBindings.length > 1) {
        throw new Error(localize(
            'connectorTriggerBindingAmbiguous',
            'The selected event already matches multiple Poll bindings.',
        ));
    }
    if (matchingBindings.length === 1) {
        return {
            alreadyExists: true,
            identity: baseIdentity,
            instance: 1,
        };
    }
    if (registrations.some(registration =>
        equalsIgnoreCase(registration, baseIdentity.functionName))) {
        throw new Error(localize(
            'connectorTriggerBindingIncomplete',
            'The selected event function already exists without complete Poll binding settings.',
        ));
    }

    let fileIdentity: ConnectorTriggerEventIdentity | undefined;
    let fileInstance = 1;
    for (; fileInstance <= 100; fileInstance++) {
        const candidate = getConnectorTriggerEventIdentity(
            handoff.connectorId,
            handoff.operationId,
            fileInstance,
        );
        if (await isGeneratedIdentityAvailable(
            projectPath,
            language,
            candidate,
        )) {
            fileIdentity = candidate;
            break;
        }
    }
    if (!fileIdentity) {
        throw new Error(localize(
            'connectorTriggerIdentityUnavailable',
            'Unable to create a unique file for the selected Connector Trigger.',
        ));
    }

    let triggerConfigSettingName = baseIdentity.triggerConfigSettingName;
    for (let settingInstance = 2; bindings.some(binding =>
        equalsIgnoreCase(
            binding.triggerConfigSettingName,
            triggerConfigSettingName,
        )); settingInstance++) {
        triggerConfigSettingName =
            `${baseIdentity.functionName}${settingInstance}TriggerConfigName`;
        if (settingInstance > 100) {
            throw new Error(localize(
                'connectorTriggerSettingUnavailable',
                'Unable to create a unique trigger configuration setting for the selected Connector Trigger.',
            ));
        }
    }
    return {
        alreadyExists: false,
        identity: {
            ...fileIdentity,
            functionName: baseIdentity.functionName,
            triggerConfigSettingName,
        },
        instance: fileInstance,
    };
}

async function isGeneratedIdentityAvailable(
    projectPath: string,
    language: string,
    identity: ConnectorTriggerEventIdentity,
): Promise<boolean> {
    const filePath = getGeneratedFilePath(projectPath, language, identity);
    if (filePath) {
        return !await AzExtFsExtra.pathExists(filePath);
    }
    if (language === ProjectLanguage.Python) {
        const functionAppPath = path.join(projectPath, 'function_app.py');
        if (!await AzExtFsExtra.pathExists(functionAppPath)) {
            return true;
        }
        const contents = (await AzExtFsExtra.readFile(functionAppPath)).toString();
        return !new RegExp(
            `\\bdef\\s+${escapeRegExp(identity.pythonFunctionName)}\\s*\\(`,
        ).test(contents);
    }
    return true;
}

function getGeneratedFilePath(
    projectPath: string,
    language: string,
    identity: ConnectorTriggerEventIdentity,
): string | undefined {
    if (language === ProjectLanguage.CSharp) {
        return path.join(projectPath, identity.csharpFileName);
    }
    if (language === ProjectLanguage.TypeScript) {
        return path.join(
            projectPath,
            'src',
            'functions',
            identity.typescriptFileName,
        );
    }
    return undefined;
}

async function ensureCSharpProject(
    projectPath: string,
    available: AvailableConnectorIdentity,
    outputMetadata: ConnectorTriggerOutputMetadata | undefined,
): Promise<void> {
    await updateCSharpConnectorExtension(projectPath);
    if (available.alreadyExists) {
        return;
    }
    await AzExtFsExtra.writeFile(
        path.join(projectPath, available.identity.csharpFileName),
        getCSharpFunction(
            available.identity,
            available.instance,
            outputMetadata,
        ),
    );
}

export async function updateCSharpConnectorExtension(
    projectPath: string,
): Promise<void> {
    const entries = await AzExtFsExtra.readDirectory(projectPath);
    const projectFile = entries.find(entry =>
        entry.type === FileType.File &&
        entry.name.toLowerCase().endsWith('.csproj'));
    if (!projectFile) {
        throw createUnsupportedTemplateError();
    }

    const projectFilePath = path.join(projectPath, projectFile.name);
    const projectContents = (await AzExtFsExtra.readFile(projectFilePath)).toString();
    const packagePattern =
        /(<PackageReference\s+Include="Microsoft\.Azure\.Functions\.Worker\.Extensions\.Connector"\s+Version=")[^"]+("\s*\/>)/i;
    if (!packagePattern.test(projectContents)) {
        throw createUnsupportedTemplateError();
    }

    await AzExtFsExtra.writeFile(
        projectFilePath,
        projectContents.replace(
            packagePattern,
            (_match, prefix: string, suffix: string) => `${prefix}1.0.0${suffix}`,
        ),
    );
}

async function ensureTypeScriptProject(
    projectPath: string,
    available: AvailableConnectorIdentity,
    outputMetadata: ConnectorTriggerOutputMetadata | undefined,
): Promise<void> {
    if (available.alreadyExists) {
        return;
    }
    const functionsPath = path.join(projectPath, 'src', 'functions');
    await AzExtFsExtra.ensureDir(functionsPath);
    await AzExtFsExtra.writeFile(
        path.join(functionsPath, available.identity.typescriptFileName),
        getTypeScriptFunction(
            available.identity,
            available.instance,
            outputMetadata,
        ),
    );
}

async function ensurePythonProject(
    projectPath: string,
    available: AvailableConnectorIdentity,
    outputMetadata: ConnectorTriggerOutputMetadata | undefined,
): Promise<void> {
    const functionAppPath = path.join(projectPath, 'function_app.py');
    const requirementsPath = path.join(projectPath, requirementsFileName);
    if (!await AzExtFsExtra.pathExists(functionAppPath) ||
        !await AzExtFsExtra.pathExists(requirementsPath)) {
        throw createUnsupportedTemplateError();
    }

    let functionApp = (await AzExtFsExtra.readFile(functionAppPath)).toString();
    if (!available.alreadyExists) {
        const lineEnding = functionApp.includes('\r\n') ? '\r\n' : '\n';
        functionApp = ensurePythonImports(
            functionApp,
            !!outputMetadata?.schema,
            lineEnding,
        );
        functionApp = `${functionApp.trimEnd()}${lineEnding}${lineEnding}` +
            getPythonFunction(
                available.identity,
                available.instance,
                outputMetadata,
                lineEnding,
            );
        await AzExtFsExtra.writeFile(functionAppPath, functionApp);
    }
    await updatePythonFunctionsSdk(projectPath);
}

export async function updatePythonFunctionsSdk(
    projectPath: string,
): Promise<void> {
    const requirementsPath = path.join(projectPath, requirementsFileName);
    if (!await AzExtFsExtra.pathExists(requirementsPath)) {
        throw createUnsupportedTemplateError();
    }
    let requirements = (await AzExtFsExtra.readFile(requirementsPath)).toString();
    const lineEnding = requirements.includes('\r\n') ? '\r\n' : '\n';
    const azureFunctionsPattern = /^azure-functions(?:[<>=!~].*)?$/im;
    requirements = azureFunctionsPattern.test(requirements) ?
        requirements.replace(azureFunctionsPattern, 'azure-functions>=2.4.0b1') :
        `${requirements.trimEnd()}${lineEnding}azure-functions>=2.4.0b1${lineEnding}`;
    await AzExtFsExtra.writeFile(requirementsPath, requirements);
}

function getCSharpFunction(
    identity: ConnectorTriggerEventIdentity,
    instance: number,
    outputMetadata: ConnectorTriggerOutputMetadata | undefined,
): string {
    const schema = outputMetadata?.schema;
    const limitation = getOutputLimitationComment(outputMetadata);
    const modelName = schema ?
        getOutputModelName(identity, instance, schema) :
        undefined;
    const typedBody = schema && modelName ?
        getCSharpTypedBody(identity, schema, modelName) :
        `        ${limitation}\n` +
        `        logger.LogInformation("${identity.operationId} connector event received.");`;
    const typedHelpers = schema && modelName ?
        getCSharpEnvelopeDefinitions(identity, schema, modelName) :
        '';
    const modelDefinition = schema && modelName ?
        `${getCSharpOutputModelDefinition(schema, modelName)}\n` :
        '';
    const schemaUsings = schema ?
        `using System.Collections.Generic;\n` +
        `using System.Text.Json;\n` +
        `using System.Text.Json.Serialization;\n` :
        '';
    return `${schemaUsings}using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Connector;
using Microsoft.Extensions.Logging;

public sealed class ${identity.csharpClassName}
{
    private readonly ILogger<${identity.csharpClassName}> logger;

    public ${identity.csharpClassName}(ILogger<${identity.csharpClassName}> logger)
    {
        this.logger = logger;
    }

    [Function("${identity.functionName}")]
    public void Run(
        [ConnectorTrigger(
            DeliveryMode = ConnectorTriggerDeliveryMode.Poll,
            Connection = "${connectionSettingName}",
            TriggerConfigName = "%${identity.triggerConfigSettingName}%")]
        string payload)
    {
${typedBody}
    }
${typedHelpers ? `\n${indentText(typedHelpers, '    ')}\n` : ''}
}

${modelDefinition}`;
}

function getCSharpTypedBody(
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

function getCSharpEnvelopeDefinitions(
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

function getTypeScriptFunction(
    identity: ConnectorTriggerEventIdentity,
    instance: number,
    outputMetadata: ConnectorTriggerOutputMetadata | undefined,
): string {
    const schema = outputMetadata?.schema;
    const limitation = getOutputLimitationComment(outputMetadata);
    const modelName = schema ?
        getOutputModelName(identity, instance, schema) :
        undefined;
    const model = schema && modelName ?
        `${getTypeScriptOutputModelDefinition(schema, modelName)}\n\n` :
        '';
    const helpers = schema && modelName ?
        getTypeScriptOutputHelpers(identity, schema, modelName) :
        '';
    const handler = schema && modelName ?
        `        const items = normalize${identity.pascalName}Items(payload);
        context.log(\`${identity.operationId} received \${items.length} item(s).\`);` :
        `        ${limitation}\n` +
        `        context.log('${identity.operationId} connector event received.');`;
    return `import { app, InvocationContext } from '@azure/functions';

${model}${helpers}app.connectorTrigger('${identity.functionName}', {
    deliveryMode: 'Poll',
    connection: '${connectionSettingName}',
    triggerConfigName: '%${identity.triggerConfigSettingName}%',
    handler: async (payload, context: InvocationContext) => {
${handler}
    },
});
`;
}

function getTypeScriptOutputHelpers(
    identity: ConnectorTriggerEventIdentity,
    schema: ConnectorTriggerOutputSchema,
    modelName: string,
): string {
    const collection = schema.collectionPath === 'body.value' ?
        `    const record = isRecord(body) ? body : undefined;
    return Array.isArray(record?.value) ?
        record.value as ${modelName}[] :
        [];` :
        `    return Array.isArray(body) ? body as ${modelName}[] : [];`;
    return `function decodeJson(value: unknown): unknown {
    if (typeof value !== 'string') {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalize${identity.pascalName}Items(payload: unknown): ${modelName}[] {
    const envelope = decodeJson(payload);
    const outputs = isRecord(envelope) && isRecord(envelope.outputs) ?
        envelope.outputs :
        undefined;
    const body = decodeJson(outputs?.body);
${collection}
}

`;
}

function getPythonFunction(
    identity: ConnectorTriggerEventIdentity,
    instance: number,
    outputMetadata: ConnectorTriggerOutputMetadata | undefined,
    lineEnding: string,
): string {
    const schema = outputMetadata?.schema;
    const limitation = getOutputLimitationComment(outputMetadata, '#');
    const modelName = schema ?
        getOutputModelName(identity, instance, schema) :
        undefined;
    const typedDefinitions = schema && modelName ?
        `${getPythonOutputModelDefinition(schema, modelName)}${lineEnding}${lineEnding}` +
        `${getPythonOutputHelpers(identity, schema, modelName, lineEnding)}${lineEnding}` :
        '';
    const handlerBody = schema && modelName ?
        `    items = _normalize_${identity.pythonFunctionName}_items(payloads)${lineEnding}` +
        `    logging.info("${identity.functionName} received %s item(s).", len(items))${lineEnding}` :
        `    ${limitation}${lineEnding}` +
        `    logging.info("${identity.functionName} connector event received.")${lineEnding}`;
    return `${typedDefinitions}` +
        `@app.function_name(name="${identity.functionName}")${lineEnding}` +
        `@app.connector_trigger(${lineEnding}` +
        `    arg_name="payloads",${lineEnding}` +
        `    delivery_mode=func.DeliveryMode.POLL,${lineEnding}` +
        `    connection="${connectionSettingName}",${lineEnding}` +
        `    trigger_config_name="%${identity.triggerConfigSettingName}%",${lineEnding}` +
        `    cardinality=func.Cardinality.MANY,${lineEnding}` +
        `    max_batch_size=4,${lineEnding}` +
        `)${lineEnding}` +
        `def ${identity.pythonFunctionName}(payloads: List[str]) -> None:${lineEnding}` +
        handlerBody;
}

function getPythonOutputHelpers(
    identity: ConnectorTriggerEventIdentity,
    schema: ConnectorTriggerOutputSchema,
    modelName: string,
    lineEnding: string,
): string {
    const constantName = `_${identity.pythonFunctionName.toUpperCase()}_WIRE_PROPERTIES`;
    const mappings = schema.properties.map(property =>
        `    ${JSON.stringify(property.name)}: ` +
        `${JSON.stringify(getPythonOutputFieldName(property.name))},`,
    ).join(lineEnding);
    const collection = schema.collectionPath === 'body.value' ?
        `        if isinstance(body, dict) and isinstance(body.get("value"), list):${lineEnding}` +
        `            raw_items.extend(body["value"])${lineEnding}` :
        `        if isinstance(body, list):${lineEnding}` +
        `            raw_items.extend(body)${lineEnding}`;
    return `${constantName} = {${lineEnding}${mappings}${lineEnding}}${lineEnding}${lineEnding}` +
        `def _decode_${identity.pythonFunctionName}_json(value: Any) -> Any:${lineEnding}` +
        `    if not isinstance(value, str):${lineEnding}` +
        `        return value${lineEnding}` +
        `    try:${lineEnding}` +
        `        return json.loads(value)${lineEnding}` +
        `    except json.JSONDecodeError:${lineEnding}` +
        `        return None${lineEnding}${lineEnding}` +
        `def _normalize_${identity.pythonFunctionName}_items(${lineEnding}` +
        `    payloads: List[str],${lineEnding}` +
        `) -> List[${modelName}]:${lineEnding}` +
        `    raw_items: List[Any] = []${lineEnding}` +
        `    for payload in payloads:${lineEnding}` +
        `        envelope = _decode_${identity.pythonFunctionName}_json(payload)${lineEnding}` +
        `        if not isinstance(envelope, dict):${lineEnding}` +
        `            continue${lineEnding}` +
        `        outputs = envelope.get("outputs")${lineEnding}` +
        `        if not isinstance(outputs, dict):${lineEnding}` +
        `            continue${lineEnding}` +
        `        body = _decode_${identity.pythonFunctionName}_json(outputs.get("body"))${lineEnding}` +
        collection +
        `    return [${lineEnding}` +
        `        ${modelName}(**{${lineEnding}` +
        `            property_name: item[wire_name]${lineEnding}` +
        `            for wire_name, property_name in ${constantName}.items()${lineEnding}` +
        `            if wire_name in item${lineEnding}` +
        `        })${lineEnding}` +
        `        for item in raw_items${lineEnding}` +
        `        if isinstance(item, dict)${lineEnding}` +
        `    ]${lineEnding}`;
}

function ensurePythonImports(
    contents: string,
    needsSchemaImports: boolean,
    lineEnding: string,
): string {
    let result = contents;
    const anchorPattern = /^import azure\.functions as func$/m;
    if (!anchorPattern.test(result)) {
        throw createUnsupportedTemplateError();
    }
    const missingImports = [
        'import logging',
        ...(needsSchemaImports ? [
            'import json',
            'from dataclasses import dataclass',
        ] : []),
    ].filter(statement =>
        !new RegExp(`^${escapeRegExp(statement)}$`, 'm').test(result));

    const requiredTypingImports = new Set([
        'List',
        ...(needsSchemaImports ? ['Any', 'Dict', 'Optional'] : []),
    ]);
    const typingPattern = /^from typing import ([^\r\n]+)$/m;
    const typingMatch = typingPattern.exec(result);
    if (typingMatch) {
        const imports = new Set(
            typingMatch[1].split(',').map(value => value.trim()).filter(Boolean),
        );
        for (const name of requiredTypingImports) {
            imports.add(name);
        }
        result = result.replace(
            typingPattern,
            `from typing import ${[...imports].sort().join(', ')}`,
        );
    } else {
        missingImports.push(
            `from typing import ${[...requiredTypingImports].sort().join(', ')}`,
        );
    }
    if (missingImports.length > 0) {
        result = result.replace(
            anchorPattern,
            match => `${match}${lineEnding}${missingImports.join(lineEnding)}`,
        );
    }
    return result;
}

function getOutputModelName(
    identity: ConnectorTriggerEventIdentity,
    instance: number,
    schema: ConnectorTriggerOutputSchema,
): string {
    const base = getConnectorTriggerOutputModelName(
        identity.pascalName.replace(new RegExp(`${instance > 1 ? instance : ''}$`), ''),
        schema,
    );
    return instance > 1 ? `${base}${instance}` : base;
}

function getOutputLimitationComment(
    metadata: ConnectorTriggerOutputMetadata | undefined,
    prefix = '//',
): string {
    const limitation = metadata?.limitation ?? 'definition-unavailable';
    return `${prefix} Output schema ${limitation}; the Connector binding keeps the raw envelope payload.`;
}

function equalsIgnoreCase(
    left: string | undefined,
    right: string,
): boolean {
    return !!left &&
        left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function createUnsupportedTemplateError(): Error {
    return new Error(localize(
        'connectorTriggerPollTemplateUnsupported',
        'The selected project template cannot be configured for Connector Trigger Poll debugging.',
    ));
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function indentText(value: string, indent: string): string {
    return value.split(/\r?\n/).map(line => `${indent}${line}`).join('\n');
}
