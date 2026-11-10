/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { FileType } from 'vscode';
import { localSettingsFileName, localStorageEmulatorConnectionString, ProjectLanguage, requirementsFileName, workerRuntimeKey } from '../constants';
import { ensureLocalSettingsIgnored, getLocalSettingsJsonWithDefaults } from '../funcConfig/local.settings';
import { localize } from '../localize';
import {
    findNonPollingFunctionRegistrations,
    findPollingConnectorBindings,
    type ConnectorTriggerBindingCandidate,
} from './connectorTriggerBindings';
import {
    getConnectorTriggerEventIdentity,
    type ConnectorTriggerEventIdentity,
} from './connectorTriggerEventIdentity';
import { type ConnectorTriggerSelection } from './connectorTriggerSelection';
import { type ConnectorTriggerOutputMetadata } from './connectorTriggerOutputSchema';

const connectionSettingName = 'ConnectorNamespace';

interface AvailableConnectorIdentity {
    alreadyExists: boolean;
    binding: ConnectorTriggerBindingCandidate;
    identity: ConnectorTriggerEventIdentity;
}

export async function ensureConnectorTriggerPollProject(
    projectPath: string,
    language: string,
    selection: ConnectorTriggerSelection,
    _outputMetadata?: ConnectorTriggerOutputMetadata,
): Promise<void> {
    const workerRuntime = language === ProjectLanguage.CSharp ? 'dotnet-isolated' :
        language === ProjectLanguage.TypeScript ? 'node' :
            language === ProjectLanguage.Python ? 'python' : undefined;
    if (!workerRuntime) {
        throw new Error(localize(
            'connectorTriggerPollLanguageUnsupported',
            'Connector Trigger Poll projects are not supported for language "{0}".',
            language,
        ));
    }
    const available = await getAvailableConnectorIdentity(
        projectPath,
        language,
        selection,
    );
    const localSettingsPath = path.join(projectPath, localSettingsFileName);
    const settings = await getLocalSettingsJsonWithDefaults(localSettingsPath, {
        AzureWebJobsStorage: localStorageEmulatorConnectionString,
        [workerRuntimeKey]: workerRuntime,
        [`${available.binding.connectionSettingName}__pollingEndpoint`]: 'https://<connector-namespace-host>',
        [available.binding.triggerConfigSettingName]: '<trigger-configuration-name>',
    });
    switch (language) {
        case ProjectLanguage.CSharp:
            await ensureCSharpProject(projectPath, available);
            break;
        case ProjectLanguage.TypeScript:
            await ensureTypeScriptProject(projectPath, available);
            break;
        case ProjectLanguage.Python:
            await ensurePythonProject(projectPath, available);
            break;
    }
    await ensureLocalSettingsIgnored(projectPath);
    await AzExtFsExtra.writeJSON(localSettingsPath, settings);
}

async function getAvailableConnectorIdentity(
    projectPath: string,
    language: string,
    selection: ConnectorTriggerSelection,
): Promise<AvailableConnectorIdentity> {
    const nonPollingRegistrations = await findNonPollingFunctionRegistrations(projectPath);
    const bindings = await findPollingConnectorBindings(projectPath);
    const baseIdentity = getConnectorTriggerEventIdentity(
        selection.connectorId,
        selection.operationId,
    );
    const matchingBindings = bindings.filter(binding =>
        equalsIgnoreCase(binding.functionName, baseIdentity.functionName));
    if (matchingBindings.length > 1) {
        throw new Error(localize(
            'connectorTriggerBindingAmbiguous',
            'The selected event already matches multiple Poll bindings.',
        ));
    }
    // An existing Poll binding must not hide another registration with the same name.
    if (nonPollingRegistrations.some(registration =>
        equalsIgnoreCase(registration, baseIdentity.functionName))) {
        throw new Error(localize(
            'connectorTriggerFunctionNameCollision',
            'A function with the selected event name is already registered. Rename the existing function or select another event before adding a Connector Trigger.',
        ));
    }
    if (matchingBindings.length === 1) {
        return {
            alreadyExists: true,
            binding: matchingBindings[0],
            identity: baseIdentity,
        };
    }

    let fileIdentity: ConnectorTriggerEventIdentity | undefined;
    let fileInstance = 1;
    for (; fileInstance <= 100; fileInstance++) {
        const candidate = getConnectorTriggerEventIdentity(
            selection.connectorId,
            selection.operationId,
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
        binding: {
            connectionSettingName,
            functionName: baseIdentity.functionName,
            triggerConfigSettingName,
        },
        identity: {
            ...fileIdentity,
            functionName: baseIdentity.functionName,
            triggerConfigSettingName,
        },
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
): Promise<void> {
    await updateCSharpConnectorExtension(projectPath);
    if (available.alreadyExists) {
        return;
    }
    await AzExtFsExtra.writeFile(
        path.join(projectPath, available.identity.csharpFileName),
        getCSharpFunction(available.identity),
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
): Promise<void> {
    if (available.alreadyExists) {
        return;
    }
    const functionsPath = path.join(projectPath, 'src', 'functions');
    await AzExtFsExtra.ensureDir(functionsPath);
    await AzExtFsExtra.writeFile(
        path.join(functionsPath, available.identity.typescriptFileName),
        getTypeScriptFunction(available.identity),
    );
}

async function ensurePythonProject(
    projectPath: string,
    available: AvailableConnectorIdentity,
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
        functionApp = ensurePythonImports(functionApp, lineEnding);
        functionApp = `${functionApp.trimEnd()}${lineEnding}${lineEnding}` +
            getPythonFunction(
                available.identity,
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
): string {
    return `using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
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
        using var document = JsonDocument.Parse(payload);
        var data = document.RootElement;
        logger.LogInformation("${identity.functionName} received JSON of kind {PayloadKind}.", data.ValueKind);
    }
}
`;
}

function getTypeScriptFunction(
    identity: ConnectorTriggerEventIdentity,
): string {
    return `import { app, InvocationContext } from '@azure/functions';

app.connectorTrigger('${identity.functionName}', {
    deliveryMode: 'Poll',
    connection: '${connectionSettingName}',
    triggerConfigName: '%${identity.triggerConfigSettingName}%',
    handler: async (payload: unknown, context: InvocationContext) => {
        let data: unknown = payload;
        if (typeof payload === 'string') {
            try {
                data = JSON.parse(payload);
            } catch {
                throw new SyntaxError('Invalid Connector Trigger JSON payload.');
            }
        }
        context.log('${identity.functionName} received JSON of type', typeof data);
    },
});
`;
}

function getPythonFunction(
    identity: ConnectorTriggerEventIdentity,
    lineEnding: string,
): string {
    return `@app.function_name(name="${identity.functionName}")${lineEnding}` +
        `@app.connector_trigger(${lineEnding}` +
        `    arg_name="payloads",${lineEnding}` +
        `    delivery_mode=func.DeliveryMode.POLL,${lineEnding}` +
        `    connection="${connectionSettingName}",${lineEnding}` +
        `    trigger_config_name="%${identity.triggerConfigSettingName}%",${lineEnding}` +
        `    cardinality=func.Cardinality.MANY,${lineEnding}` +
        `    max_batch_size=4,${lineEnding}` +
        `)${lineEnding}` +
        `def ${identity.pythonFunctionName}(payloads: List[str]) -> None:${lineEnding}` +
        `    for payload in payloads:${lineEnding}` +
        `        data = json.loads(payload)${lineEnding}` +
        `        logging.info("${identity.functionName} received JSON of type %s.", type(data).__name__)${lineEnding}`;
}

function ensurePythonImports(
    contents: string,
    lineEnding: string,
): string {
    let result = contents;
    const anchorPattern = /^import azure\.functions as func$/m;
    if (!anchorPattern.test(result)) {
        throw createUnsupportedTemplateError();
    }
    const missingImports = [
        'import logging',
        'import json',
    ].filter(statement =>
        !new RegExp(`^${escapeRegExp(statement)}$`, 'm').test(result));

    const requiredTypingImports = new Set(['List']);
    const typingPattern = /^from typing import ([A-Za-z_]\w*(?:[ \t]*,[ \t]*[A-Za-z_]\w*)*)[ \t]*$/m;
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
        'The selected project template cannot be materialized for the Connector Trigger Poll event.',
    ));
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
